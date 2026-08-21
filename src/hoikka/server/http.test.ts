/**
 * Content-Length is a claim, not a fact. These guard the case where a client
 * declares a small body and then streams a large one — the only version of a
 * body limit that actually holds is the one applied while reading.
 */
import { describe, it, expect } from "vitest";
import { capStream, readTextCapped } from "./http.js";

function streamOf(chunks: string[], declaredLength?: number): Request {
	const body = new ReadableStream<Uint8Array>({
		start(controller) {
			for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk));
			controller.close();
		}
	});
	return new Request("http://localhost/hook", {
		method: "POST",
		body,
		duplex: "half",
		headers: declaredLength ? { "content-length": String(declaredLength) } : {}
	} as RequestInit & { duplex: "half" });
}

async function drain(stream: ReadableStream<Uint8Array>): Promise<number> {
	const reader = stream.getReader();
	let total = 0;
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		total += value?.byteLength ?? 0;
	}
	return total;
}

describe("readTextCapped", () => {
	it("returns a body that fits", async () => {
		expect(await readTextCapped(streamOf(["hello ", "world"]), 1024)).toBe("hello world");
	});

	it("reassembles multi-chunk bodies exactly", async () => {
		const chunks = ["{", '"a":1,', '"b":2', "}"];
		expect(await readTextCapped(streamOf(chunks), 1024)).toBe('{"a":1,"b":2}');
	});

	it("refuses a body that lies about its length", async () => {
		// Declares 10 bytes, sends 30_000
		const request = streamOf(["x".repeat(30_000)], 10);
		expect(await readTextCapped(request, 1024)).toBeNull();
	});

	it("stops as soon as the limit is passed, mid-stream", async () => {
		const request = streamOf(["a".repeat(600), "b".repeat(600), "c".repeat(600)]);
		expect(await readTextCapped(request, 1000)).toBeNull();
	});
});

describe("capStream", () => {
	it("passes a stream that fits straight through", async () => {
		const source = streamOf(["abc", "def"]).body!;
		expect(await drain(capStream(source, 1024))).toBe(6);
	});

	it("errors the stream rather than storing an oversized body", async () => {
		const source = streamOf(["x".repeat(2048)]).body!;
		await expect(drain(capStream(source, 1024))).rejects.toThrow(/permitted size/i);
	});
});
