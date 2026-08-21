/**
 * Provider descriptor factories for hoikka.config.ts.
 *
 * These return plain data — never SDK clients — so the config file stays
 * importable everywhere (server, client bundles, CLI tools). The core maps
 * each `code` to its implementation; passing an object that implements the
 * PaymentProvider/ShippingProvider interface instead registers a custom one.
 */
import type { ProviderDescriptor } from "./types.js";

export interface StripeOptions {
	/**
	 * Authorise on confirmation and capture only after the order commits, so a
	 * lost stock race voids a hold instead of refunding a charge. Off by
	 * default: manual capture removes payment methods that don't support it
	 * (iDEAL, Bancontact, SEPA debit, ...) from the Payment Element and holds
	 * expire in ~7 days. STRIPE_MANUAL_CAPTURE=true still overrides.
	 */
	manualCapture?: boolean;
}

export function stripe(options: StripeOptions = {}): ProviderDescriptor {
	return { code: "stripe", label: "Stripe", options: { ...options } };
}

/** Settles instantly without moving money. Dev/test only — the core refuses
 * to offer it outside dev unless ENABLE_MOCK_PAYMENTS=true. */
export function mockPayment(): ProviderDescriptor {
	return { code: "mock", label: "Mock Payment", options: {} };
}

export interface FlatRateOptions {
	/** Rate in minor units (cents). */
	amount?: number;
	label?: string;
	estimatedDeliveryDays?: number;
	description?: string;
}

export function flatRate(options: FlatRateOptions = {}): ProviderDescriptor {
	return {
		code: "flat_rate",
		label: options.label ?? "Standard Shipping",
		options: { ...options }
	};
}
