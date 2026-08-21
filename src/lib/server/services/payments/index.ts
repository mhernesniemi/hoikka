/**
 * Payment Service
 * Manages payment methods and order payment processing
 * Uses provider pattern for modular payment gateway support
 */
import { eq, and, desc, inArray } from "drizzle-orm";
import { db } from "../../db/index.js";
import { paymentMethods, payments } from "../../db/schema.js";
import type { PaymentMethod, Payment, NewPayment, OrderWithRelations } from "$lib/types.js";
import type {
	PaymentProvider,
	PaymentInfo,
	PaymentStatus,
	PaymentVerification,
	RefundInfo
} from "./types.js";
import { MockProvider, StripeProvider } from "./providers/index.js";
import config from "$hoikka/config";

/**
 * Provider registry, built from hoikka.config.ts. A descriptor's `code` maps
 * to a built-in implementation; an object that already implements
 * PaymentProvider registers as-is — the extension point that works without
 * ejecting.
 */
const BUILT_IN: Record<string, (options: Record<string, unknown>) => PaymentProvider> = {
	mock: () => new MockProvider(),
	stripe: (options) => new StripeProvider(options)
};

function buildRegistry(): Map<string, PaymentProvider> {
	const registry = new Map<string, PaymentProvider>();
	for (const entry of config.payments) {
		const candidate = entry as PaymentProvider & { options?: Record<string, unknown> };
		if (typeof candidate.createPayment === "function") {
			registry.set(candidate.code, candidate);
			continue;
		}
		const factory = BUILT_IN[candidate.code];
		if (!factory) {
			throw new Error(
				`hoikka.config.ts: unknown payment provider "${candidate.code}" — built-ins are ${Object.keys(BUILT_IN).join(", ")}, or pass an object implementing PaymentProvider`
			);
		}
		registry.set(candidate.code, factory(candidate.options ?? {}));
	}
	return registry;
}

const PROVIDERS = buildRegistry();

/** Both SQLite drivers report the partial-unique clash the same way. */
function isUniqueViolation(error: unknown): boolean {
	const message =
		error instanceof Error
			? `${error.message} ${(error as { cause?: { message?: string } }).cause?.message ?? ""}`
			: String(error);
	return message.includes("UNIQUE constraint failed");
}

/** A provider that exists and is usable on this deployment. */
function availableProvider(code: string): PaymentProvider | null {
	const provider = PROVIDERS.get(code);
	if (!provider) return null;
	if (provider.isAvailable && !provider.isAvailable()) return null;
	return provider;
}

export class PaymentService {
	/**
	 * Get the payment methods checkout may offer: enabled in the admin *and*
	 * backed by a provider that is configured on this deployment. A method
	 * whose provider is missing or unavailable is never offered — and never
	 * charged, see createPayment.
	 */
	async getActiveMethods(): Promise<PaymentMethod[]> {
		const methods = await db
			.select()
			.from(paymentMethods)
			.where(eq(paymentMethods.active, true))
			.orderBy(desc(paymentMethods.code));

		return methods.filter((method) => availableProvider(method.code) !== null);
	}

	/**
	 * Get payment method by code
	 */
	async getMethodByCode(code: string): Promise<PaymentMethod | null> {
		const [method] = await db
			.select()
			.from(paymentMethods)
			.where(eq(paymentMethods.code, code))
			.limit(1);

		return method ?? null;
	}

	/**
	 * Get payment method by ID
	 */
	async getMethodById(id: number): Promise<PaymentMethod | null> {
		const [method] = await db
			.select()
			.from(paymentMethods)
			.where(eq(paymentMethods.id, id))
			.limit(1);

		return method ?? null;
	}

	/**
	 * Create a payment for an order using a payment provider
	 */
	async createPayment(
		order: OrderWithRelations,
		paymentMethodId: number
	): Promise<{ payment: Payment; paymentInfo: PaymentInfo }> {
		const method = await this.getMethodById(paymentMethodId);
		if (!method) {
			throw new Error("Payment method not found");
		}

		// Fail closed: a method disabled in the admin, or whose provider is not
		// configured here, must not be chargeable even if the client asks for it
		// by id.
		if (!method.active) {
			throw new Error(`Payment method ${method.code} is not active`);
		}

		const provider = availableProvider(method.code);
		if (!provider) {
			throw new Error(`Provider not available for method ${method.code}`);
		}

		// Create payment via provider. Providers key their idempotency on the
		// order's payment revision, so two concurrent calls here get the *same*
		// gateway transaction rather than two chargeable ones.
		const paymentInfo = await provider.createPayment(order);

		// Save payment record (include clientSecret in metadata for page reload).
		// `payments_one_active_per_order_idx` allows exactly one chargeable row
		// per order: whichever request loses the race reads the winner's row
		// instead of adding a second one.
		try {
			const [payment] = await db
				.insert(payments)
				.values({
					orderId: order.id,
					paymentMethodId: method.id,
					method: method.code, // Legacy field
					amount: order.total,
					state: "pending",
					transactionId: paymentInfo.providerTransactionId,
					metadata: {
						...paymentInfo.metadata,
						clientSecret: paymentInfo.clientSecret
					}
				})
				.returning();

			return { payment, paymentInfo };
		} catch (error) {
			if (!isUniqueViolation(error)) throw error;

			const existing = await this.getActiveForOrder(order.id);
			if (!existing) throw error;

			console.log("[payment] concurrent_create_collapsed", {
				orderId: order.id,
				paymentId: existing.id
			});
			const metadata = (existing.metadata ?? {}) as { clientSecret?: string };
			return {
				payment: existing,
				paymentInfo: {
					...paymentInfo,
					providerTransactionId: existing.transactionId ?? "",
					clientSecret: metadata.clientSecret
				}
			};
		}
	}

	/**
	 * The payment that represents this order's money: the settled one if there
	 * is one, otherwise whatever is still chargeable, otherwise the most recent
	 * attempt. Superseded and declined rows are kept for the audit trail but
	 * are not what an admin means by "the payment".
	 */
	async getPrimaryForOrder(orderId: number): Promise<Payment | null> {
		const all = await this.getByOrderId(orderId);
		return (
			all.find((p) => p.state === "settled" || p.state === "refunded") ??
			all.find((p) => p.state === "pending" || p.state === "authorized") ??
			all[0] ??
			null
		);
	}

	/** The one chargeable payment an order may have at a time, if any. */
	async getActiveForOrder(orderId: number): Promise<Payment | null> {
		const [payment] = await db
			.select()
			.from(payments)
			.where(
				and(
					eq(payments.orderId, orderId),
					inArray(payments.state, ["pending", "authorized"])
				)
			)
			.limit(1);

		return payment ?? null;
	}

	/**
	 * Get payment by ID
	 */
	async getById(id: number): Promise<Payment | null> {
		const [payment] = await db.select().from(payments).where(eq(payments.id, id));

		return payment ?? null;
	}

	/**
	 * Get payments for an order
	 */
	async getByOrderId(orderId: number): Promise<Payment[]> {
		return db
			.select()
			.from(payments)
			.where(eq(payments.orderId, orderId))
			.orderBy(desc(payments.createdAt));
	}

	/**
	 * Ask the provider what happened to a payment and persist the result.
	 * Returns the gateway's own view (status plus amount/currency/order where
	 * the gateway reports them) — callers must check those against the order
	 * before fulfilling.
	 */
	async confirmPayment(paymentId: number): Promise<PaymentVerification> {
		const payment = await this.getById(paymentId);
		if (!payment) {
			throw new Error("Payment not found");
		}

		const method = await this.getMethodById(payment.paymentMethodId);
		if (!method) {
			throw new Error("Payment method not found");
		}

		const provider = availableProvider(method.code);
		if (!provider) {
			throw new Error(`Provider not available for method ${method.code}`);
		}

		if (!provider.confirmPayment) {
			// If provider doesn't support confirmation, return current state
			return { status: payment.state as PaymentStatus };
		}

		if (!payment.transactionId) {
			throw new Error("Payment has no transaction ID");
		}

		try {
			const verification = await provider.confirmPayment(payment.transactionId);

			// Update payment state
			await db
				.update(payments)
				.set({
					state: verification.status
				})
				.where(eq(payments.id, paymentId));

			return verification;
		} catch (error) {
			console.error("[payment] confirmation_failed", {
				paymentId,
				orderId: payment.orderId,
				error: (error as Error).message
			});
			throw error;
		}
	}

	/**
	 * Capture an authorised payment. Providers without a separate capture step
	 * (the mock) report their existing state unchanged.
	 */
	async capturePayment(paymentId: number): Promise<PaymentVerification> {
		const payment = await this.getById(paymentId);
		if (!payment) throw new Error("Payment not found");

		const method = await this.getMethodById(payment.paymentMethodId);
		const provider = method ? availableProvider(method.code) : null;

		if (!provider?.capturePayment || !payment.transactionId) {
			return { status: payment.state as PaymentStatus };
		}

		const verification = await provider.capturePayment(payment.transactionId);
		await db
			.update(payments)
			.set({ state: verification.status })
			.where(eq(payments.id, paymentId));

		return verification;
	}

	/**
	 * Void a payment that can no longer be used — the order total changed, or
	 * the shopper picked a different method. The provider is asked to cancel
	 * (best effort) and the row is marked "cancelled", which is deliberately
	 * distinct from a gateway decline: a declined attempt may still be retried
	 * on the same intent, a cancelled one may never be honoured.
	 */
	async cancelPayment(paymentId: number): Promise<void> {
		const payment = await this.getById(paymentId);
		if (!payment || payment.state === "settled" || payment.state === "refunded") return;

		const method = await this.getMethodById(payment.paymentMethodId);
		const provider = method ? availableProvider(method.code) : null;

		if (provider?.cancelPayment && payment.transactionId) {
			try {
				await provider.cancelPayment(payment.transactionId);
			} catch (error) {
				console.warn("[payment] cancel_failed", {
					paymentId,
					error: (error as Error).message
				});
			}
		}

		await db.update(payments).set({ state: "cancelled" }).where(eq(payments.id, paymentId));
	}

	/**
	 * Whether a payment may still be used to pay `order`. A payment is only
	 * reusable while it is unsettled and still covers exactly the current
	 * total with the same method — otherwise a shopper could create a cheap
	 * intent, grow the order, and settle it with the old one.
	 */
	isReusableFor(payment: Payment, order: OrderWithRelations, paymentMethodId?: number): boolean {
		if (payment.state !== "pending" && payment.state !== "authorized") return false;
		if (payment.amount !== order.total) return false;
		if (paymentMethodId !== undefined && payment.paymentMethodId !== paymentMethodId) {
			return false;
		}
		return true;
	}

	/**
	 * Refund a payment via provider
	 */
	async refundPayment(paymentId: number, amount?: number): Promise<RefundInfo> {
		const payment = await this.getById(paymentId);
		if (!payment) {
			throw new Error("Payment not found");
		}

		if (payment.state !== "settled") {
			throw new Error(`Cannot refund payment in state: ${payment.state}`);
		}

		const method = await this.getMethodById(payment.paymentMethodId);
		if (!method) {
			throw new Error("Payment method not found");
		}

		const provider = availableProvider(method.code);
		if (!provider || !provider.refundPayment) {
			throw new Error(`Provider ${method.code} does not support refunds`);
		}

		if (!payment.transactionId) {
			throw new Error("Payment has no transaction ID");
		}

		const refundAmount = amount ?? payment.amount;
		if (refundAmount > payment.amount) {
			throw new Error("Refund amount exceeds payment amount");
		}

		try {
			const refundInfo = await provider.refundPayment(payment.transactionId, refundAmount);

			// Update payment state
			await db
				.update(payments)
				.set({
					state: "refunded",
					metadata: {
						...(payment.metadata as Record<string, unknown>),
						refund: refundInfo
					}
				})
				.where(eq(payments.id, paymentId));

			return refundInfo;
		} catch (error) {
			console.error("[payment] refund_failed", {
				paymentId,
				orderId: payment.orderId,
				error: (error as Error).message
			});
			throw error;
		}
	}

	/**
	 * Register a new payment provider
	 */
	registerProvider(provider: PaymentProvider): void {
		PROVIDERS.set(provider.code, provider);
	}
}

// Export singleton instance
export const paymentService = new PaymentService();

// Re-export types and helpers for convenience
export type { PaymentInfo, PaymentStatus, PaymentVerification, RefundInfo } from "./types.js";
export { isPaymentSuccessful } from "./types.js";
