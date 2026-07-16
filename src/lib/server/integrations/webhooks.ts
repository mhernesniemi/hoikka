/**
 * HMAC signing/verification for webhooks, using Web Crypto (crypto.subtle) so
 * it runs identically on Node and Cloudflare Workers.
 */

async function hmacKey(secret: string): Promise<CryptoKey> {
	return crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign", "verify"]
	);
}

function toHex(buffer: ArrayBuffer): string {
	return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Hex-encoded HMAC-SHA256 of `body` — put it in an outbound webhook header. */
export async function signPayload(body: string, secret: string): Promise<string> {
	const key = await hmacKey(secret);
	const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
	return toHex(sig);
}

/**
 * Verify an inbound webhook signature. `crypto.subtle.verify` is
 * constant-time, so this is safe against timing attacks.
 */
export async function verifySignature(
	body: string,
	signatureHex: string,
	secret: string
): Promise<boolean> {
	const clean = signatureHex.replace(/^sha256=/, "").trim();
	if (!/^[0-9a-f]*$/i.test(clean) || clean.length % 2 !== 0) return false;
	const bytes = new Uint8Array(clean.match(/../g)?.map((h) => parseInt(h, 16)) ?? []);
	const key = await hmacKey(secret);
	return crypto.subtle.verify("HMAC", key, bytes, new TextEncoder().encode(body));
}
