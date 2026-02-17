/**
 * Webhook Verification Utilities
 *
 * Helpers for verifying incoming webhook signatures from external systems.
 */

/**
 * Verify HMAC-SHA256 signature
 */
export function verifyHmacSha256(
	body: string,
	signature: string,
	secret: string,
	prefix = ""
): boolean {
	const hasher = new Bun.CryptoHasher("sha256", secret);
	hasher.update(body);
	const expected = prefix + hasher.digest("hex");

	// Constant-time comparison
	if (signature.length !== expected.length) return false;
	return Bun.hash(signature) === Bun.hash(expected);
}

/**
 * Pre-built signature verifiers for common services
 */
export const signatureVerifiers = {
	/**
	 * Stripe webhook signature
	 */
	stripe: (request: Request, body: string, secret: string): boolean => {
		const signature = request.headers.get("stripe-signature");
		if (!signature) return false;

		const parts = signature.split(",").reduce(
			(acc, part) => {
				const [key, value] = part.split("=");
				acc[key] = value;
				return acc;
			},
			{} as Record<string, string>
		);

		const timestamp = parts["t"];
		const sig = parts["v1"];
		if (!timestamp || !sig) return false;

		const signedPayload = `${timestamp}.${body}`;
		return verifyHmacSha256(signedPayload, sig, secret);
	},

	/**
	 * GitHub webhook signature
	 */
	github: (request: Request, body: string, secret: string): boolean => {
		const signature = request.headers.get("x-hub-signature-256");
		if (!signature) return false;
		return verifyHmacSha256(body, signature, secret, "sha256=");
	},

	/**
	 * Generic HMAC-SHA256 in header
	 */
	hmacHeader:
		(headerName: string, prefix = "") =>
		(request: Request, body: string, secret: string): boolean => {
			const signature = request.headers.get(headerName);
			if (!signature) return false;
			return verifyHmacSha256(body, signature, secret, prefix);
		}
};
