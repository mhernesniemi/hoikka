/**
 * The outbox row for an event. Separate from events.ts (which uses the
 * request-scoped db) so code with its own db handle can put event inserts in
 * its own atomic batch: `db.insert(outbox).values(eventRow(...))`. Relative
 * imports only, so CLI scripts can load it through plain tsx.
 */
export interface EmitOptions {
	/** Delay before the first attempt (ms). Default: immediate. */
	delayMs?: number;
	/** Max attempts before the event is marked failed. Default: 5. */
	maxAttempts?: number;
}

export function eventRow(type: string, payload: unknown, options: EmitOptions = {}) {
	return {
		type,
		payload,
		nextAttemptAt: new Date(Date.now() + (options.delayMs ?? 0)),
		maxAttempts: options.maxAttempts ?? 5
	};
}
