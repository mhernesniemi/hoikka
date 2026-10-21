/**
 * Task runner tests against a real in-memory SQLite (full migration chain), so
 * the unique "one running row per task" index is the lock under test.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("$env/dynamic/private", () => ({ env: { DATABASE_URL: ":memory:" } }));
import { db } from "../db/index.js";
import { taskRuns } from "../db/schema.js";
import { registerTask, runDueTasks, runTask, taskStatuses } from "./tasks.js";

let counter = 0;
const uniqueName = () => `test-task-${++counter}`;

describe("tasks", () => {
	beforeEach(async () => {
		await db.delete(taskRuns);
	});

	it("records a successful run with its summary", async () => {
		const name = uniqueName();
		registerTask(name, { everyMinutes: 15, run: async () => ({ synced: 3 }) });

		const run = await runTask(name);

		expect(run).toMatchObject({ task: name, trigger: "manual", status: "succeeded" });
		expect(run?.summary).toEqual({ synced: 3 });
		expect(run?.finishedAt).toBeInstanceOf(Date);
	});

	it("records a failed run with its error", async () => {
		const name = uniqueName();
		registerTask(name, {
			everyMinutes: 15,
			run: async () => {
				throw new Error("ERP unreachable");
			}
		});

		const run = await runTask(name);

		expect(run).toMatchObject({ status: "failed", error: "ERP unreachable" });
	});

	it("skips a run while the same task is still running", async () => {
		const name = uniqueName();
		let release!: () => void;
		let calls = 0;
		registerTask(name, {
			everyMinutes: 15,
			// Only the first run blocks, so later tests' runDueTasks can finish
			run: () =>
				calls++ === 0
					? new Promise<void>((resolve) => (release = resolve))
					: Promise.resolve()
		});

		const first = runTask(name, "schedule");
		await vi.waitFor(() => expect(calls).toBe(1));
		expect(await runTask(name)).toBeNull();

		release();
		expect(await first).toMatchObject({ status: "succeeded" });
		expect(calls).toBe(1);
	});

	it("takes over the lock of a run that timed out", async () => {
		const name = uniqueName();
		registerTask(name, { everyMinutes: 15, timeoutMinutes: 30, run: async () => {} });
		await db.insert(taskRuns).values({
			task: name,
			trigger: "schedule",
			status: "running",
			startedAt: new Date(Date.now() - 31 * 60_000)
		});

		expect(await runTask(name)).toMatchObject({ status: "succeeded" });
		const rows = await db.select().from(taskRuns);
		expect(rows.find((row) => row.error === "Timed out")).toBeDefined();
	});

	it("runs a scheduled task only once its interval has passed", async () => {
		const name = uniqueName();
		registerTask(name, { everyMinutes: 15, run: async () => {} });

		expect(await runDueTasks()).toContain(name);
		expect(await runDueTasks()).not.toContain(name);

		// Pretend the last run started 15 minutes ago
		await db.update(taskRuns).set({ startedAt: new Date(Date.now() - 15 * 60_000) });
		expect(await runDueTasks()).toContain(name);
	});

	it("flags a task whose last success is too old", async () => {
		const fresh = uniqueName();
		const stale = uniqueName();
		const failing = uniqueName();
		for (const name of [fresh, stale, failing]) {
			registerTask(name, { everyMinutes: 15, run: async () => {} });
		}
		const old = new Date(Date.now() - 46 * 60_000);
		await db.insert(taskRuns).values([
			{ task: fresh, trigger: "schedule", status: "succeeded", startedAt: new Date() },
			{ task: stale, trigger: "schedule", status: "succeeded", startedAt: old },
			{ task: failing, trigger: "schedule", status: "failed", startedAt: new Date() }
		]);

		const byName = new Map((await taskStatuses()).map((status) => [status.name, status]));

		expect(byName.get(fresh)?.stale).toBe(false);
		expect(byName.get(stale)?.stale).toBe(true);
		expect(byName.get(failing)?.stale).toBe(true);
		expect(byName.get("housekeeping")?.stale).toBe(false);
	});
});
