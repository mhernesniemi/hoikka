import { describe, it, expect, vi, afterEach } from "vitest";

vi.mock("$env/dynamic/private", () => ({ env: {} as Record<string, string | undefined> }));
import { env } from "$env/dynamic/private";
import { captureEvent } from "./sentry.js";

describe("captureEvent", () => {
	afterEach(() => {
		delete env.SENTRY_DSN;
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it("does nothing without SENTRY_DSN", async () => {
		const fetch = vi.fn();
		vi.stubGlobal("fetch", fetch);

		await captureEvent({ message: "Down" });

		expect(fetch).not.toHaveBeenCalled();
	});

	it("posts an envelope to the DSN's project, keeping a path prefix", async () => {
		env.SENTRY_DSN = "https://key1@sentry.example.com/self-hosted/12";
		const fetch = vi.fn(async () => new Response("{}"));
		vi.stubGlobal("fetch", fetch);

		await captureEvent({ message: "Down" });

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

	it("logs instead of throwing when Sentry refuses the event", async () => {
		env.SENTRY_DSN = "https://k@o1.ingest.sentry.io/1";
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => new Response("", { status: 401 }))
		);
		const log = vi.spyOn(console, "error").mockImplementation(() => {});

		await captureEvent({ message: "x" });

		expect(String(log.mock.calls[0][1])).toContain("Sentry responded 401");
	});
});
