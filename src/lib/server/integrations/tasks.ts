/**
 * Scheduled tasks: recurring work like an ERP pull or housekeeping.
 *
 * Register a task with how often it should run; the same tick that drains the
 * outbox runs the due ones (Node interval, or the Cloudflare cron through
 * /api/tasks/run), so a task never needs its own timer or cron entry. Every
 * run is recorded in `task_runs`, which is also the lock: a unique index
 * allows one running row per task, so overlapping ticks or a "Run now" click
 * during a scheduled run skip instead of running twice.
 *
 * A task that starts failing, or goes stale (no success for too long, as when
 * a run hangs), is reported once per streak through its onFailure, by default
 * to Sentry when SENTRY_DSN is set and otherwise to the error log.
 *
 * Register your own tasks in ./project.ts.
 */
import { and, desc, eq, inArray, isNull, lt } from "drizzle-orm";
import { env } from "$env/dynamic/private";
import { db } from "../db/index.js";
import { taskRuns } from "../db/schema.js";
import { pruneOutbox } from "./events.js";
import { pruneRateLimits } from "../rate-limit.js";
import { orderService } from "../services/orders.js";
import { digitalDeliveryService } from "../services/digitalDelivery.js";
import { sendToSentry } from "../sentry.js";

export interface TaskDefinition {
	/** Shown in the admin; defaults to the task name. */
	label?: string;
	/** Minutes between scheduled runs. */
	everyMinutes: number;
	/** A run still marked running after this long is treated as crashed. Default: 30. */
	timeoutMinutes?: number;
	/** Flag the task as stale when its last success is older than this. Default: 3 × everyMinutes. */
	staleAfterMinutes?: number;
	/** Return a small summary (counts) to show in the admin. Throw to mark the run failed. */
	run: () => Promise<Record<string, unknown> | void>;
	/** Called once when the task starts failing or goes stale. Default: reportTaskAlert. */
	onFailure?: (alert: TaskAlert) => Promise<void> | void;
}

export type TaskRun = typeof taskRuns.$inferSelect;

export interface TaskAlert {
	task: string;
	label: string;
	kind: "failed" | "stale";
	/** The failed run, or a stale task's last run. */
	run: TaskRun;
	lastSuccessAt: Date | null;
}

export interface TaskStatus {
	name: string;
	label: string;
	everyMinutes: number;
	lastRun: TaskRun | null;
	lastSuccessAt: Date | null;
	stale: boolean;
}

// Ticks land on minute boundaries but run a little late; without slack a task
// started at 12:00:00.4 would not be due again at 12:15:00.2.
const DUE_SLACK_MS = 30_000;
const RUN_HISTORY_MS = 30 * 24 * 60 * 60_000;

const tasks = new Map<string, TaskDefinition>();

export function registerTask(name: string, definition: TaskDefinition): void {
	tasks.set(name, definition);
}

export function getTask(name: string): TaskDefinition | undefined {
	return tasks.get(name);
}

async function lastRun(name: string, status?: TaskRun["status"]): Promise<TaskRun | null> {
	const [row] = await db
		.select()
		.from(taskRuns)
		.where(and(eq(taskRuns.task, name), status ? eq(taskRuns.status, status) : undefined))
		.orderBy(desc(taskRuns.startedAt))
		.limit(1);
	return row ?? null;
}

/** Report to Sentry when SENTRY_DSN is set, otherwise to the error log. */
export async function reportTaskAlert(alert: TaskAlert): Promise<void> {
	const message =
		alert.kind === "failed"
			? `Task "${alert.label}" failed: ${alert.run.error}`
			: `Task "${alert.label}" is stale: no successful run since ${alert.lastSuccessAt?.toISOString() ?? "it was added"}`;
	if (env.SENTRY_DSN) {
		try {
			await sendToSentry(env.SENTRY_DSN, {
				message,
				fingerprint: ["hoikka-task", alert.task, alert.kind],
				tags: { task: alert.task, kind: alert.kind },
				extra: { runId: alert.run.id, lastSuccessAt: alert.lastSuccessAt?.toISOString() }
			});
			return;
		} catch (err) {
			console.error("[tasks] could not report to Sentry:", err);
		}
	}
	console.error(`[tasks] ${message}`);
}

async function alert(
	name: string,
	task: TaskDefinition,
	details: Omit<TaskAlert, "task" | "label" | "lastSuccessAt">
) {
	try {
		const lastSuccess = await lastRun(name, "succeeded");
		await (task.onFailure ?? reportTaskAlert)({
			task: name,
			label: task.label ?? name,
			lastSuccessAt: lastSuccess?.startedAt ?? null,
			...details
		});
	} catch (err) {
		console.error(`[tasks] ${name} alert failed:`, err);
	}
}

/**
 * Alert on a failed run unless it was alerted already: as a hung run reported
 * stale, or through the run before it failing too.
 */
async function alertOnFailure(name: string, task: TaskDefinition, run: TaskRun) {
	if (run.alertedAt) return;
	const [previous] = await db
		.select({ status: taskRuns.status })
		.from(taskRuns)
		.where(and(eq(taskRuns.task, name), lt(taskRuns.id, run.id)))
		.orderBy(desc(taskRuns.id))
		.limit(1);
	if (previous?.status !== "failed") await alert(name, task, { kind: "failed", run });
}

/**
 * Run a task now, unless it is already running. Returns the finished run, or
 * null when it was skipped.
 */
export async function runTask(
	name: string,
	trigger: TaskRun["trigger"] = "manual"
): Promise<TaskRun | null> {
	const task = tasks.get(name);
	if (!task) throw new Error(`No task registered as "${name}"`);

	// Release the lock of a run that never finished (crash, killed process)
	const timeoutMs = (task.timeoutMinutes ?? 30) * 60_000;
	const [timedOut] = await db
		.update(taskRuns)
		.set({ status: "failed", error: "Timed out", finishedAt: new Date() })
		.where(
			and(
				eq(taskRuns.task, name),
				eq(taskRuns.status, "running"),
				lt(taskRuns.startedAt, new Date(Date.now() - timeoutMs))
			)
		)
		.returning();
	if (timedOut) await alertOnFailure(name, task, timedOut);

	const [started] = await db
		.insert(taskRuns)
		.values({ task: name, trigger, status: "running", startedAt: new Date() })
		.onConflictDoNothing()
		.returning();
	if (!started) return null;

	let finished: Partial<TaskRun>;
	try {
		const summary = await task.run();
		finished = { status: "succeeded", summary: summary ?? null };
	} catch (err) {
		console.error(`[tasks] ${name} failed:`, err);
		finished = { status: "failed", error: err instanceof Error ? err.message : String(err) };
	}
	const [row] = await db
		.update(taskRuns)
		.set({ ...finished, finishedAt: new Date() })
		.where(eq(taskRuns.id, started.id))
		.returning();
	if (row.status === "failed") await alertOnFailure(name, task, row);
	return row;
}

/**
 * Run every task whose interval has elapsed since its last run. Tasks run side
 * by side, so a slow one does not hold up the others.
 */
export async function runDueTasks(): Promise<string[]> {
	const ran = await Promise.all(
		[...tasks].map(async ([name, task]) => {
			const last = await lastRun(name);
			const dueAt = last ? last.startedAt.getTime() + task.everyMinutes * 60_000 : 0;
			const run = Date.now() + DUE_SLACK_MS < dueAt ? null : await runTask(name, "schedule");
			await alertIfStale(name, task);
			return run ? name : null;
		})
	);
	return ran.filter((name) => name !== null);
}

/**
 * A failing task was alerted when it started failing; this catches the rest,
 * such as a run that hangs. Claiming the last run makes it once per streak,
 * also across overlapping ticks and processes.
 */
async function alertIfStale(name: string, task: TaskDefinition) {
	const status = await statusOf(name, task);
	if (!status.stale || !status.lastRun || status.lastRun.status === "failed") return;
	const [claimed] = await db
		.update(taskRuns)
		.set({ alertedAt: new Date() })
		.where(and(eq(taskRuns.id, status.lastRun.id), isNull(taskRuns.alertedAt)))
		.returning();
	if (claimed) await alert(name, task, { kind: "stale", run: claimed });
}

async function statusOf(name: string, task: TaskDefinition): Promise<TaskStatus> {
	const [last, lastSuccess] = await Promise.all([lastRun(name), lastRun(name, "succeeded")]);
	const staleMs = (task.staleAfterMinutes ?? task.everyMinutes * 3) * 60_000;
	return {
		name,
		label: task.label ?? name,
		everyMinutes: task.everyMinutes,
		lastRun: last,
		lastSuccessAt: lastSuccess?.startedAt ?? null,
		stale: lastSuccess
			? Date.now() - lastSuccess.startedAt.getTime() > staleMs
			: last?.status === "failed"
	};
}

export async function taskStatuses(): Promise<TaskStatus[]> {
	return Promise.all([...tasks].map(([name, task]) => statusOf(name, task)));
}

export async function recentTaskRuns(limit = 25): Promise<TaskRun[]> {
	return db.select().from(taskRuns).orderBy(desc(taskRuns.startedAt)).limit(limit);
}

async function pruneTaskRuns(): Promise<void> {
	await db
		.delete(taskRuns)
		.where(
			and(
				inArray(taskRuns.status, ["succeeded", "failed"]),
				lt(taskRuns.startedAt, new Date(Date.now() - RUN_HISTORY_MS))
			)
		);
}

// ── Built-in: housekeeping ───────────────────────────────────────────────────
// Old outbox rows, abandoned checkout drafts, expired download grants, spent
// rate-limit counters: the work that must not sit on a customer's request.

registerTask("housekeeping", {
	label: "Housekeeping",
	everyMinutes: 60,
	async run() {
		const failed: string[] = [];
		for (const [name, job] of [
			["outbox", pruneOutbox],
			["drafts", () => orderService.deleteStaleDrafts()],
			["download-grants", () => digitalDeliveryService.pruneExpiredGrants()],
			["rate-limits", pruneRateLimits],
			["task-runs", pruneTaskRuns]
		] as const) {
			try {
				await job();
			} catch (err) {
				console.error(`[housekeeping] ${name} failed:`, err);
				failed.push(name);
			}
		}
		if (failed.length > 0) throw new Error(`Failed: ${failed.join(", ")}`);
	}
});
