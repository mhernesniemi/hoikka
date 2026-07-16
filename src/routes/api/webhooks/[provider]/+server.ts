/**
 * Inbound webhook receiver. Verifies an HMAC-SHA256 signature (Web Crypto, so
 * it works on Node and Workers) and records the event to the outbox for
 * out-of-band processing.
 *
 * Secret per provider via env: WEBHOOK_SECRET_<PROVIDER> (uppercased), e.g.
 * WEBHOOK_SECRET_ERP. Signature header: x-hoikka-signature (hex or sha256=hex).
 */
import { json, error } from "@sveltejs/kit";
import { env } from "$env/dynamic/private";
import { verifySignature } from "$lib/server/integrations/webhooks.js";
import { emitEvent } from "$lib/server/integrations/events.js";
import type { RequestHandler } from "./$types.js";

export const POST: RequestHandler = async ({ request, params }) => {
	const provider = params.provider.replace(/[^a-zA-Z0-9_-]/g, "");
	const secret = env[`WEBHOOK_SECRET_${provider.toUpperCase()}`];
	if (!secret) throw error(404, "Unknown webhook provider");

	const body = await request.text();
	const signature = request.headers.get("x-hoikka-signature") ?? "";
	if (!(await verifySignature(body, signature, secret))) {
		throw error(401, "Invalid signature");
	}

	let payload: unknown;
	try {
		payload = JSON.parse(body);
	} catch {
		throw error(400, "Invalid JSON");
	}

	// Record for out-of-band handling; add a handler for this type in handlers.ts
	await emitEvent(`webhook.${provider}`, payload);
	return json({ received: true });
};
