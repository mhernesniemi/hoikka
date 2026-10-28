/**
 * Task runner tests against a real in-memory SQLite (full migration chain), so
 * the unique "one running row per task" index is the lock under test.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("$env/dynamic/private", () => ({ env: { DATABASE_URL: ":memory:" } }));
import { env } from "$env/dynamic/private";
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

	describe("failure reports", () => {
		it("reports once when a task starts failing, and again after it recovers", async () => {
			const name = uniqueName();
			const onFailure = vi.fn();
			let fail = true;
			registerTask(name, {
				label: "ERP sync",
				everyMinutes: 15,
				onFailure,
				run: async () => {
					if (fail) throw new Error("ERP unreachable");
				}
			});

			await runTask(name);
			await runTask(name);
			await runTask(name);
			expect(onFailure).toHaveBeenCalledOnce();
			expect(onFailure.mock.calls[0][0]).toMatchObject({
				task: name,
				label: "ERP sync",
				run: { status: "failed", error: "ERP unreachable" }
			});

			fail = false;
			await runTask(name);
			fail = true;
			await runTask(name);
			expect(onFailure).toHaveBeenCalledTimes(2);
		});

		it("reports a run that timed out", async () => {
			const name = uniqueName();
			const onFailure = vi.fn();
			registerTask(name, { everyMinutes: 15, onFailure, run: async () => {} });
			await db.insert(taskRuns).values({
				task: name,
				trigger: "schedule",
				status: "running",
				startedAt: new Date(Date.now() - 31 * 60_000)
			});

			await runTask(name);

			expect(onFailure).toHaveBeenCalledOnce();
			expect(onFailure.mock.calls[0][0].run).toMatchObject({ error: "Timed out" });
		});

		it("keeps the run recorded when onFailure throws", async () => {
			const name = uniqueName();
			registerTask(name, {
				everyMinutes: 15,
				onFailure: () => {
					throw new Error("alerting down");
				},
				run: async () => {
					throw new Error("ERP unreachable");
				}
			});
			const log = vi.spyOn(console, "error").mockImplementation(() => {});

			expect(await runTask(name)).toMatchObject({ status: "failed" });
			log.mockRestore();
		});

		it("logs by default, and sends to Sentry when SENTRY_DSN is set", async () => {
			const name = uniqueName();
			registerTask(name, {
				label: "ERP sync",
				everyMinutes: 15,
				run: async () => {
					throw new Error("ERP unreachable");
				}
			});
			env.SENTRY_DSN = "https://abc123@o1.ingest.sentry.io/42";
			const fetch = vi.fn(async () => new Response("{}"));
			vi.stubGlobal("fetch", fetch);
			const log = vi.spyOn(console, "error").mockImplementation(() => {});

			try {
				await runTask(name);

				expect(log).toHaveBeenCalledWith('[tasks] Task "ERP sync" failed: ERP unreachable');
				const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
				expect(url).toBe("https://o1.ingest.sentry.io/api/42/envelope/");
				expect(JSON.parse(String(init.body).split("\n")[2])).toMatchObject({
					message: { formatted: 'Task "ERP sync" failed: ERP unreachable' },
					fingerprint: ["hoikka-task", name],
					tags: { task: name }
				});
			} finally {
				delete env.SENTRY_DSN;
				vi.unstubAllGlobals();
				log.mockRestore();
			}
		});
	});
});
