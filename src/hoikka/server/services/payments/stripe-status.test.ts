/**
 * A refused card must not end the order. Stripe puts the intent back into
 * `requires_payment_method` so the shopper can try another card on the same
 * intent — recording that as a decline would strand an order that is about to
 * be paid, and would make the later success look like a duplicate charge.
 */
import { describe, it, expect } from "vitest";
import { paymentStatusForIntent } from "./providers/stripe.js";

describe("paymentStatusForIntent", () => {
	it("keeps a refused card retriable", () => {
		expect(paymentStatusForIntent("requires_payment_method")).toBe("pending");
	});

	it("treats every in-flight status as pending", () => {
		for (const status of ["requires_confirmation", "requires_action", "processing"] as const) {
			expect(paymentStatusForIntent(status)).toBe("pending");
		}
	});

	it("settles only a succeeded intent", () => {
		expect(paymentStatusForIntent("succeeded")).toBe("settled");
	});

	it("reports an uncaptured authorisation", () => {
		expect(paymentStatusForIntent("requires_capture")).toBe("authorized");
	});

	it("declines only a cancelled intent", () => {
		expect(paymentStatusForIntent("canceled")).toBe("declined");
	});
});
