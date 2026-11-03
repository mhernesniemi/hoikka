/**
 * Invoice Provider
 * Pay later on an invoice (B2B, or a store whose ERP bills orders): nothing is
 * charged online. The payment settles at once, so the order is placed and
 * reaches "paid"; billing, and any credit note for a refund, happen outside.
 */
import type { PaymentProvider, PaymentInfo, PaymentVerification, RefundInfo } from "../types.js";
import type { OrderWithRelations } from "#lib/types.js";
import { nanoid } from "nanoid";

export class InvoiceProvider implements PaymentProvider {
	code = "invoice";

	async createPayment(order: OrderWithRelations): Promise<PaymentInfo> {
		return {
			providerTransactionId: `invoice_${nanoid(16)}`,
			metadata: { provider: "invoice", orderId: order.id, orderCode: order.code }
		};
	}

	async confirmPayment(): Promise<PaymentVerification> {
		return { status: "settled" };
	}

	async cancelPayment(): Promise<void> {
		// Nothing was charged, so there is nothing to void
	}

	async refundPayment(_paymentId: string, amount?: number): Promise<RefundInfo> {
		return { refundedAmount: amount ?? 0 };
	}
}
