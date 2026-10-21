/**
 * The engine behind `atomic()`, taking the database explicitly so code that
 * also runs outside a request (CLI scripts through plain tsx, an ERP sync
 * called from a seed script) can batch writes too. Relative imports only.
 *
 * D1 has no interactive transactions but executes `batch()` as one implicit
 * transaction; better-sqlite3 has no `batch()` but runs a synchronous
 * transaction on its single connection. Pass unexecuted drizzle statements
 * (don't await them yourself).
 */
import type { BatchItem } from "drizzle-orm/batch";
import type { Db } from "./index.js";

export async function runAtomic(
	backend: Db,
	statements: readonly BatchItem<"sqlite">[]
): Promise<void> {
	if (statements.length === 0) return;
	if ("batch" in backend && typeof backend.batch === "function") {
		await (backend as { batch(s: readonly BatchItem<"sqlite">[]): Promise<unknown> }).batch(
			statements
		);
		return;
	}

	// better-sqlite3 is a single connection shared by every request in the
	// process, and it is *synchronous*. So the batch must run without ever
	// yielding: an earlier version issued BEGIN and then awaited each statement,
	// which handed control back to the event loop mid-transaction and let
	// unrelated writes from other requests land inside it — to be committed
	// early, or rolled back along with it. Driving the statements synchronously
	// inside the driver's own transaction() closes that window completely,
	// because nothing else in the process can run until it returns.
	const node = backend as unknown as { transaction<T>(fn: () => T): T };
	node.transaction(() => {
		for (const statement of statements) {
			// Query builders expose run(); a raw db.run(sql`...`) exposes
			// execute(). Both are synchronous on this driver.
			const runnable = statement as unknown as {
				run?: () => unknown;
				execute?: () => unknown;
			};
			if (typeof runnable.run === "function") runnable.run();
			else if (typeof runnable.execute === "function") runnable.execute();
			else throw new Error("atomic(): statement cannot be run synchronously");
		}
	});
}
