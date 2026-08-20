/**
 * Mock Payment Provider
 * Development/test only: it settles every payment without moving money, so it
 * must never be reachable on a real deployment. `isAvailable` keeps it out of
 * checkout unless the store runs in dev or explicitly opts in with
 * ENABLE_MOCK_PAYMENTS=true (used by the e2e suite against a built app).
 */
import type { PaymentProvider, PaymentInfo, PaymentVerification, RefundInfo } from "../types.js";
import type { OrderWithRelations } from "$lib/types.js";
import { dev } from "$app/environment";
import { env } from "$env/dynamic/private";
import { nanoid } from "nanoid";

export class MockProvider implements PaymentProvider {
	code = "mock";

	isAvailable(): boolean {
		return dev || env.ENABLE_MOCK_PAYMENTS === "true";
	}

	/**
	 * Create a mock payment
	 */
	async createPayment(order: OrderWithRelations): Promise<PaymentInfo> {
		const mockTransactionId = `mock_${nanoid(16)}`;

		return {
			providerTransactionId: mockTransactionId,
			clientSecret: `mock_secret_${nanoid(32)}`,
			metadata: {
				provider: "mock",
				orderId: order.id,
				orderCode: order.code,
				amount: order.total,
				currency: order.currencyCode.toLowerCase(),
				createdAt: new Date().toISOString()
			}
		};
	}

	/**
	 * Confirm payment - mock always succeeds unless the id is marked to fail
	 */
	async confirmPayment(paymentId: string): Promise<PaymentVerification> {
		if (paymentId.includes("_fail_")) {
			return { status: "declined" };
		}

		// No gateway to ask: report only the status and let the caller's own
		// order/payment amount check stand as the invariant.
		return { status: "settled" };
	}

	async cancelPayment(): Promise<void> {
		// Nothing to void — the mock holds no state.
	}

	// No capturePayment: the mock settles on confirmation, so completion takes
	// the already-settled path rather than authorise-commit-capture.

	/**
	 * Refund payment
	 */
	async refundPayment(paymentId: string, amount?: number): Promise<RefundInfo> {
		const mockRefundId = `refund_${nanoid(16)}`;

		return {
			refundedAmount: amount ?? 0,
			refundId: mockRefundId,
			metadata: {
				provider: "mock",
				paymentId,
				refundedAt: new Date().toISOString()
			}
		};
	}
}
