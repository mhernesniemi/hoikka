/**
 * Outbox event handlers.
 *
 * Register a handler per event type; the runner calls it when a matching event
 * is due. A handler that throws is retried with backoff (up to maxAttempts).
 * This mirrors the payment/shipping provider registries — plain functions in a
 * map, easy to see and extend.
 *
 * Add your ERP sync, PIM push, notification, etc. as handlers here.
 */
export type EventHandler = (payload: unknown) => Promise<void>;

const handlers = new Map<string, EventHandler>();

export function registerHandler(type: string, handler: EventHandler): void {
	handlers.set(type, handler);
}

export function getHandler(type: string): EventHandler | undefined {
	return handlers.get(type);
}

// ── Built-in example: forward paid orders to a configured webhook URL ────────
// Emitted from the checkout completion path (see checkout.remote.ts). Set
// ORDER_WEBHOOK_URL (+ optional ORDER_WEBHOOK_SECRET) to enable; otherwise the
// event is a no-op and completes immediately.
import { env } from "$env/dynamic/private";
import { signPayload } from "./webhooks.js";

registerHandler("order.paid", async (payload) => {
	const url = env.ORDER_WEBHOOK_URL;
	if (!url) return; // not configured — nothing to do

	const body = JSON.stringify({ event: "order.paid", data: payload });
	const headers: Record<string, string> = { "content-type": "application/json" };
	if (env.ORDER_WEBHOOK_SECRET) {
		headers["x-hoikka-signature"] = await signPayload(body, env.ORDER_WEBHOOK_SECRET);
	}

	const res = await fetch(url, { method: "POST", headers, body });
	if (!res.ok) {
		// Throwing schedules a retry with backoff
		throw new Error(`order.paid webhook failed: ${res.status}`);
	}
});
