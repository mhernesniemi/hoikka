import { fail } from "@sveltejs/kit";
import { getTask, recentTaskRuns, runTask, taskStatuses } from "#lib/server/integrations/tasks.js";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async () => {
	const [tasks, runs] = await Promise.all([taskStatuses(), recentTaskRuns()]);
	return { tasks, runs };
};

export const actions: Actions = {
	run: async ({ request }) => {
		const name = String((await request.formData()).get("task") ?? "");
		if (!getTask(name)) return fail(404, { error: "Unknown task" });

		const run = await runTask(name, "manual");
		if (!run) return fail(409, { error: "The task is already running" });
		if (run.status === "failed") return fail(500, { error: run.error ?? "The task failed" });
		return { success: true };
	}
};
