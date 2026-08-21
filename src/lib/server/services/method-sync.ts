/**
 * Keep the payment/shipping method tables aligned with hoikka.config.ts.
 *
 * Two truths by design: config declares *capability* (which providers exist
 * and how they behave), the DB rows are the merchant's *toggles and copy*
 * (active flag, display name a shop owner may edit). This sync inserts a row
 * for any configured provider that has none — it never deletes or reactivates,
 * so admin decisions survive config edits. Runs once per server instance.
 */
import { db } from "../db/index.js";
import { paymentMethods, shippingMethods } from "../db/schema.js";
import config from "$hoikka/config";

let synced = false;

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
		}
		for (const entry of config.shipping) {
			const { code, label } = entry as { code: string; label?: string };
			await db
				.insert(shippingMethods)
				.values({ code, name: label ?? code, active: true })
				.onConflictDoNothing({ target: shippingMethods.code });
		}
	} catch (error) {
		// Never take a request down over method bookkeeping — the seed
		// migration already covers the built-ins on fresh databases.
		synced = false;
		console.error("[config] method sync failed:", error);
	}
}
