/**
 * Payment Service
 * Manages payment methods and order payment processing
 * Uses provider pattern for modular payment gateway support
 */
import { eq, and, inArray, desc } from "drizzle-orm";
import { db } from "../../db/index.js";
import { paymentMethods, payments } from "../../db/schema.js";
import type {
	PaymentMethod,
	NewPaymentMethod,
	Payment,
	NewPayment,
	OrderWithRelations
} from "$lib/types.js";
import type { PaymentProvider, PaymentInfo, PaymentStatus, RefundInfo } from "./types.js";
import { MockProvider, StripeProvider } from "./providers/index.js";
import { withSpan } from "../../telemetry.js";

// Provider registry - maps provider codes to provider instances
const PROVIDERS: Map<string, PaymentProvider> = new Map([
	["mock", new MockProvider()],
	["stripe", new StripeProvider()]
]);

export class PaymentService {
	/**
	 * Get all active payment methods
	 */
	async getActiveMethods(): Promise<PaymentMethod[]> {
		return db
			.select()
			.from(paymentMethods)
			.where(eq(paymentMethods.active, true))
			.orderBy(paymentMethods.code);
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
		return withSpan(
			"payment.create",
			async () => {
				const method = await this.getMethodById(paymentMethodId);
				if (!method) {
					throw new Error("Payment method not found");
				}

				const provider = PROVIDERS.get(method.code);
				if (!provider) {
					throw new Error(`Provider not found for method ${method.code}`);
				}

				// Create payment via provider
				const paymentInfo = await provider.createPayment(order);

				// Save payment record (include clientSecret in metadata for page reload)
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
			},
			{
				"order.id": order.id,
				"payment.amount": order.total,
				"payment.method_id": paymentMethodId
			}
		);
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
	 * Confirm payment status via provider
	 */
	async confirmPayment(paymentId: number): Promise<PaymentStatus> {
		return withSpan(
			"payment.confirm",
			async () => {
				const payment = await this.getById(paymentId);
				if (!payment) {
					throw new Error("Payment not found");
				}

				const method = await this.getMethodById(payment.paymentMethodId);
				if (!method) {
					throw new Error("Payment method not found");
				}

				const provider = PROVIDERS.get(method.code);
				if (!provider || !provider.confirmPayment) {
					// If provider doesn't support confirmation, return current state
					return payment.state as PaymentStatus;
				}

				if (!payment.transactionId) {
					throw new Error("Payment has no transaction ID");
				}

				try {
					const status = await provider.confirmPayment(payment.transactionId);

					// Update payment state
					await db
						.update(payments)
						.set({
							state: status
						})
						.where(eq(payments.id, paymentId));

					return status;
				} catch (error) {
					console.error("[payment] confirmation_failed", {
						paymentId,
						orderId: payment.orderId,
						error: (error as Error).message
					});
					throw error;
				}
			},
			{ "payment.id": paymentId }
		);
	}

	/**
	 * Refund a payment via provider
	 */
	async refundPayment(paymentId: number, amount?: number): Promise<RefundInfo> {
		return withSpan(
			"payment.refund",
			async () => {
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

				const provider = PROVIDERS.get(method.code);
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
					const refundInfo = await provider.refundPayment(
						payment.transactionId,
						refundAmount
					);

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
			},
			{ "payment.id": paymentId, "payment.refund_amount": amount ?? 0 }
		);
	}

	/**
	 * Register a new payment provider
	 */
	registerProvider(provider: PaymentProvider): void {
		PROVIDERS.set(provider.code, provider);
	}

	/**
	 * Initialize default payment methods in database
	 * Call this during setup/migration
	 */
	async initializeDefaultMethods(): Promise<void> {
		const defaultMethods: NewPaymentMethod[] = [
			{
				code: "mock",
				name: "Mock Payment",
				description: "Mock payment for development and testing",
				active: true
			},
			{
				code: "stripe",
				name: "Stripe",
				description: "Pay with credit card via Stripe",
				active: true
			}
		];

		// Fetch all existing methods in one query
		const codes = defaultMethods.map((m) => m.code);
		const existing = await db
			.select()
			.from(paymentMethods)
			.where(inArray(paymentMethods.code, codes));

		const existingCodes = new Set(existing.map((m) => m.code));

		// Insert only missing methods
		const toInsert = defaultMethods.filter((m) => !existingCodes.has(m.code));
		if (toInsert.length > 0) {
			await db.insert(paymentMethods).values(toInsert);
		}
	}
}

// Export singleton instance
export const paymentService = new PaymentService();

// Re-export types and helpers for convenience
export type { PaymentInfo, PaymentStatus, RefundInfo } from "./types.js";
export { isPaymentSuccessful } from "./types.js";
