/**
 * Reading untrusted request bodies safely.
 */

/**
 * Read a request body as text, refusing to hold more than `maxBytes`.
 *
 * Content-Length is a claim by the sender, not a fact: a client can declare a
 * small body and then stream a large one. Enforcing the limit while reading is
 * the only version of the limit that holds — the header check is worth keeping
 * as a cheap early reject, but never as the guarantee.
 */
export async function readTextCapped(request: Request, maxBytes: number): Promise<string | null> {
	if (!request.body) return null;

	const reader = request.body.getReader();
	const chunks: Uint8Array[] = [];
	let total = 0;

	try {
		for (;;) {
			const { done, value } = await reader.read();
			if (done) break;
			if (!value) continue;

			total += value.byteLength;
			if (total > maxBytes) {
				await reader.cancel();
				return null;
			}
			chunks.push(value);
		}
	} finally {
		reader.releaseLock();
	}

	const joined = new Uint8Array(total);
	let offset = 0;
	for (const chunk of chunks) {
		joined.set(chunk, offset);
		offset += chunk.byteLength;
	}

	return new TextDecoder().decode(joined);
}

/**
 * Wrap a body stream so it errors past `maxBytes` instead of writing an
 * oversized object. For streamed uploads, where the bytes are handed to
 * storage rather than buffered, this is what makes the size cap real.
 */
export function capStream(
	body: ReadableStream<Uint8Array>,
	maxBytes: number
): ReadableStream<Uint8Array> {
	let total = 0;
	return body.pipeThrough(
		new TransformStream<Uint8Array, Uint8Array>({
			transform(chunk, controller) {
				total += chunk.byteLength;
				if (total > maxBytes) {
					controller.error(new Error("Body exceeds the permitted size"));
					return;
				}
				controller.enqueue(chunk);
			}
		})
	);
}
