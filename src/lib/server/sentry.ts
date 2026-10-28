/**
 * Send one event to Sentry over its envelope endpoint, with plain fetch so it
 * works on both targets without the SDK.
 */

export interface SentryEvent {
	message: string;
	level?: "error" | "warning";
	/** Events with the same fingerprint are grouped into one issue. */
	fingerprint?: string[];
	tags?: Record<string, string>;
	extra?: Record<string, unknown>;
}

export async function sendToSentry(dsn: string, event: SentryEvent): Promise<void> {
	const url = new URL(dsn);
	// https://<key>@<host>[/<path>]/<project id>
	const slash = url.pathname.lastIndexOf("/");
	const projectId = url.pathname.slice(slash + 1);
	const endpoint = `${url.protocol}//${url.host}${url.pathname.slice(0, slash)}/api/${projectId}/envelope/`;

	const eventId = crypto.randomUUID().replace(/-/g, "");
	const body = [
		{ event_id: eventId, sent_at: new Date().toISOString() },
		{ type: "event" },
		{
			event_id: eventId,
			timestamp: Date.now() / 1000,
			platform: "javascript",
			level: event.level ?? "error",
			logger: "hoikka",
			message: { formatted: event.message },
			fingerprint: event.fingerprint,
			tags: event.tags,
			extra: event.extra
		}
	]
		.map((line) => JSON.stringify(line))
		.join("\n");

	const response = await fetch(endpoint, {
		method: "POST",
		headers: {
			"content-type": "application/x-sentry-envelope",
			"x-sentry-auth": `Sentry sentry_version=7, sentry_key=${url.username}, sentry_client=hoikka/1`
		},
		body,
		signal: AbortSignal.timeout(10_000)
	});
	if (!response.ok) throw new Error(`Sentry responded ${response.status}`);
}
