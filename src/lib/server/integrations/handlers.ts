/**
 * Outbox event handlers.
 *
 * Register handlers per event type; the runner calls them when a matching event
 * is due. Several handlers can share a type: each is retried on its own, so an
 * email that fails doesn't repeat the ERP export that already succeeded. A
 * handler that throws is retried with backoff (up to maxAttempts).
 * This mirrors the payment/shipping provider registries — plain functions in a
 * map, easy to see and extend.
 *
 * Register your ERP sync, PIM push, notification, etc. in ./project.ts.
 */
/**
 * Context for one delivery attempt. `idempotencyKey` is stable across retries
 * of the same event, so a handler can hand it to an external system and have
 * duplicate deliveries collapse on the far side.
 */
export interface EventContext {
	eventId: number;
	attempt: number;
	idempotencyKey: string;
	/** The name the handler was registered under */
	handler: string;
}

export type EventHandler = (payload: unknown, context: EventContext) => Promise<void>;

const handlers = new Map<string, Map<string, EventHandler>>();

/**
 * Add a handler for an event type. `name` tells handlers of one type apart and
 * records which have succeeded across retries; registering a name again
 * replaces that handler, so keep it stable.
 */
export function registerHandler(
	type: string,
	handler: EventHandler,
	{ name = "default" }: { name?: string } = {}
): void {
	const forType = handlers.get(type) ?? new Map<string, EventHandler>();
	forType.set(name, handler);
	handlers.set(type, forType);
}

export function getHandlers(type: string): [name: string, handler: EventHandler][] {
	return [...(handlers.get(type) ?? [])];
}

// ── Built-in example: forward paid orders to a configured webhook URL ────────
// Emitted from the checkout completion path (see checkout-completion.ts). Set
// ORDER_WEBHOOK_URL (+ optional ORDER_WEBHOOK_SECRET) to enable; otherwise the
// event is a no-op and completes immediately.
import { eq } from "drizzle-orm";
import { ORDER_WEBHOOK_URL, ORDER_WEBHOOK_SECRET } from "$app/env/private";
import { db } from "../db/index.js";
import { orders } from "../db/schema.js";
import { sendEmail } from "../email.js";
import { digitalDeliveryService } from "../services/digitalDelivery.js";
import { orderService } from "../services/orders.js";
import { signPayload } from "./webhooks.js";

registerHandler(
	"order.paid",
	async (payload, context) => {
		const url = ORDER_WEBHOOK_URL;
		if (!url) return; // not configured — nothing to do

		const body = JSON.stringify({ event: "order.paid", data: payload });
		const headers: Record<string, string> = {
			"content-type": "application/json",
			// Stable across retries: the receiver can dedupe on it
			"idempotency-key": context.idempotencyKey
		};
		if (ORDER_WEBHOOK_SECRET) {
			headers["x-hoikka-signature"] = await signPayload(body, ORDER_WEBHOOK_SECRET);
		}

		const res = await fetch(url, { method: "POST", headers, body });
		if (!res.ok) {
			// Throwing schedules a retry with backoff
			throw new Error(`order.paid webhook failed: ${res.status}`);
		}
	},
	{ name: "webhook" }
);

// ── order.shipped: shipment-confirmation email ───────────────────────────────
// Emitted when an admin marks an order shipped (admin order page). Sends via
// Resend when configured; otherwise the event completes as a logged no-op.

registerHandler(
	"order.shipped",
	async (payload) => {
		const { code, trackingNumber } = (payload ?? {}) as {
			code?: string;
			trackingNumber?: string | null;
		};
		if (!code) return;

		const [order] = await db.select().from(orders).where(eq(orders.code, code));
		if (!order) throw new Error(`order.shipped: order ${code} not found`);
		if (!order.customerEmail) return;

		await sendEmail(
			order.customerEmail,
			`Your order ${order.code} has shipped`,
			`
		<p>Hi ${order.shippingFullName || ""},</p>
		<p>Your order <strong>${order.code}</strong> is on its way!</p>
		${trackingNumber ? `<p><strong>Tracking number:</strong> ${trackingNumber}</p>` : ""}
		`.trim()
		);
	},
	{ name: "shipment-email" }
);

// ── order.digital_delivery: download links for digital products ──────────────
// Emitted from checkout completion once the download grants exist. Throwing
// retries with backoff; when the attempts run out the failure is recorded on
// the order so the admin order page can show it.

registerHandler(
	"order.digital_delivery",
	async (payload) => {
		const { orderId } = (payload ?? {}) as { orderId?: number };
		if (!orderId) return;

		const result = await digitalDeliveryService.deliverOrder(orderId);
		if (result.errors.length > 0) {
			await orderService.setFulfillmentIssue(
				orderId,
				"delivery-email",
				result.errors.join("; ")
			);
			throw new Error(`digital delivery failed: ${result.errors.join("; ")}`);
		}

		// Delivered — clear this handler's own line only. An order can be waiting on
		// a missing file for one of its lines while the email for the others goes
		// out perfectly well, and that alert has to survive.
		await orderService.setFulfillmentIssue(orderId, "delivery-email", null);
	},
	{ name: "delivery-email" }
);
