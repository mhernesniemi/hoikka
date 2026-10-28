import { describe, it, expect, vi, afterEach } from "vitest";
import { sendToSentry } from "./sentry.js";

describe("sendToSentry", () => {
	afterEach(() => vi.unstubAllGlobals());

	it("posts an envelope to the DSN's project, keeping a path prefix", async () => {
		const fetch = vi.fn(async () => new Response("{}"));
		vi.stubGlobal("fetch", fetch);

		await sendToSentry("https://key1@sentry.example.com/self-hosted/12", { message: "Down" });

		const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
		expect(url).toBe("https://sentry.example.com/self-hosted/api/12/envelope/");
		expect(new Headers(init.headers).get("x-sentry-auth")).toContain("sentry_key=key1");
		const [header, item, event] = String(init.body)
			.split("\n")
			.map((line) => JSON.parse(line));
		expect(item).toEqual({ type: "event" });
		expect(event.event_id).toBe(header.event_id);
		expect(event).toMatchObject({ level: "error", message: { formatted: "Down" } });
	});

	it("throws when Sentry refuses the event", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => new Response("", { status: 401 }))
		);

		await expect(
			sendToSentry("https://k@o1.ingest.sentry.io/1", { message: "x" })
		).rejects.toThrow("Sentry responded 401");
	});
});
