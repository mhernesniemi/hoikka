/**
 * Keep the payment/shipping method tables aligned with hoikka.config.ts.
 *
 * Two truths by design: config declares *capability* (which providers exist
 * and how they behave), the DB rows are the merchant's *toggles and copy*
 * (active flag, display name a shop owner may edit). This sync inserts a row
 * for any configured provider that has none — it never deletes or reactivates,
 * so admin decisions survive config edits. Runs once per server instance.
 *
 * One exception to "never overwrite": migration 0002 seeded the built-in rows
 * with English names before any config was read. A row still carrying that
 * name takes the configured label (e.g. `flatRate({ label })`); a name an
 * admin has edited is left alone.
 */
import { and, eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { paymentMethods, shippingMethods } from "../db/schema.js";
import config from "#hoikka/config";

let synced = false;

const SEEDED_NAMES: Record<string, string> = {
	flat_rate: "Standard Shipping",
	mock: "Mock Payment",
	stripe: "Stripe"
};

export async function syncConfiguredMethods(): Promise<void> {
	if (synced) return;
	synced = true;

	try {
		for (const entry of config.payments) {
			const { code, label } = entry as { code: string; label?: string };
			await db
				.insert(paymentMethods)
				.values({ code, name: label ?? code, active: true })
				.onConflictDoNothing({ target: paymentMethods.code });
			if (label && SEEDED_NAMES[code] && label !== SEEDED_NAMES[code]) {
				await db
					.update(paymentMethods)
					.set({ name: label })
					.where(
						and(
							eq(paymentMethods.code, code),
							eq(paymentMethods.name, SEEDED_NAMES[code])
						)
					);
			}
		}
		for (const entry of config.shipping) {
			const { code, label } = entry as { code: string; label?: string };
			await db
				.insert(shippingMethods)
				.values({ code, name: label ?? code, active: true })
				.onConflictDoNothing({ target: shippingMethods.code });
			if (label && SEEDED_NAMES[code] && label !== SEEDED_NAMES[code]) {
				await db
					.update(shippingMethods)
					.set({ name: label })
					.where(
						and(
							eq(shippingMethods.code, code),
							eq(shippingMethods.name, SEEDED_NAMES[code])
						)
					);
			}
		}
	} catch (error) {
		// Never take a request down over method bookkeeping — the seed
		// migration already covers the built-ins on fresh databases.
		synced = false;
		console.error("[config] method sync failed:", error);
	}
}
