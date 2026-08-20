/**
 * Digital Delivery Service
 *
 * Fulfilment for `type: "digital"` products. Payment creates one download
 * grant per digital order line (a random, expiring, use-limited token); the
 * delivery email links to those grants. The file itself is never exposed —
 * `/downloads/<token>` resolves the asset server-side.
 *
 * Grant creation is synchronous with checkout completion (so the thank-you
 * page can link the downloads immediately); the email is sent from the outbox
 * handler, which retries with backoff.
 */
import { eq, and, isNotNull, isNull, lt } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "../db/index.js";
import {
	assets,
	digitalDownloads,
	orders,
	orderLines,
	productVariants,
	products
} from "../db/schema.js";
import { sendEmail } from "../email.js";
import { storeOrigin } from "../utils/origin.js";

/** How long a download link stays valid. */
const GRANT_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const MAX_DOWNLOADS = 10;

export type DownloadGrant = {
	token: string;
	productName: string;
	fileName: string;
	expiresAt: Date;
};

export class DigitalDeliveryService {
	/**
	 * Create the download grants for an order's digital lines. Idempotent —
	 * one grant per order line, so a retried completion reuses the existing
	 * tokens. Lines whose product has no file configured are reported as
	 * errors instead of being silently skipped.
	 *
	 * `granted` counts every line that now has a download; `created` counts only
	 * the ones this call added. Callers need both: "is there anything to email?"
	 * is a different question from "did anything change?".
	 */
	async createGrants(
		orderId: number
	): Promise<{ granted: number; created: number; errors: string[] }> {
		// A line is deliverable because it was *sold* with a file, not because
		// the product is digital today. Reading products.type here meant an
		// admin flipping digital → physical silently dropped a download the
		// customer had already paid for.
		const digitalLines = await db
			.select({
				lineId: orderLines.id,
				productName: orderLines.productName,
				digitalAssetId: orderLines.digitalAssetId
			})
			.from(orderLines)
			.where(and(eq(orderLines.orderId, orderId), isNotNull(orderLines.digitalAssetId)));

		// Separately: a line the store still considers digital but never pinned.
		// That cannot happen through checkout — the sale is refused — so it is
		// reported rather than skipped, never used to suppress a pinned line.
		const unpinned = await this.findUndeliverableLines(orderId);
		const errors = unpinned.map(
			(productName) => `"${productName}" has no downloadable file configured`
		);

		if (digitalLines.length === 0) return { granted: 0, created: 0, errors };

		let granted = 0;
		let created = 0;

		for (const line of digitalLines) {
			const [existing] = await db
				.select({ id: digitalDownloads.id })
				.from(digitalDownloads)
				.where(eq(digitalDownloads.orderLineId, line.lineId))
				.limit(1);
			if (existing) {
				granted++;
				continue;
			}

			await db.insert(digitalDownloads).values({
				orderId,
				orderLineId: line.lineId,
				assetId: line.digitalAssetId!,
				token: nanoid(48),
				expiresAt: new Date(Date.now() + GRANT_TTL_MS),
				maxDownloads: MAX_DOWNLOADS
			});
			granted++;
			created++;
		}

		return { granted, created, errors };
	}

	/**
	 * Pin each digital line to the file it is being sold with, and report any
	 * line that has none.
	 *
	 * Checking the product and then reading it again later is a race: an admin
	 * can detach the file in between, and the buyer ends up charged for
	 * something that cannot be delivered. Writing the asset id onto the line
	 * makes the check and the decision the same act — everything downstream
	 * reads the snapshot, so the product can change freely afterwards without
	 * touching an order that is already paid for.
	 */
	async snapshotDeliverables(orderId: number): Promise<{ undeliverable: string[] }> {
		const lines = await db
			.select({
				lineId: orderLines.id,
				productName: orderLines.productName,
				productType: products.type,
				pinnedType: orderLines.fulfillmentType,
				pinnedAssetId: orderLines.digitalAssetId,
				currentAssetId: products.digitalAssetId
			})
			.from(orderLines)
			.innerJoin(productVariants, eq(orderLines.variantId, productVariants.id))
			.innerJoin(products, eq(productVariants.productId, products.id))
			.where(eq(orderLines.orderId, orderId));

		const undeliverable: string[] = [];

		for (const line of lines) {
			// How the line is being sold is pinned too, and pinned first: whether
			// this order owes a shipment or a download must not change later
			// because someone edited the product.
			const soldAs = line.pinnedType ?? line.productType;
			if (!line.pinnedType) {
				await db
					.update(orderLines)
					.set({ fulfillmentType: soldAs })
					.where(and(eq(orderLines.id, line.lineId), isNull(orderLines.fulfillmentType)));
			}

			if (soldAs !== "digital") continue;

			// Once pinned it stays pinned — re-running must not silently swap
			// the file out from under an order.
			if (line.pinnedAssetId) continue;

			if (!line.currentAssetId) {
				undeliverable.push(line.productName);
				continue;
			}

			await db
				.update(orderLines)
				.set({ digitalAssetId: line.currentAssetId })
				.where(and(eq(orderLines.id, line.lineId), isNull(orderLines.digitalAssetId)));
		}

		return { undeliverable };
	}

	/**
	 * Digital lines in this order that still have no deliverable pinned to them.
	 * Read-only counterpart of snapshotDeliverables, for callers that only want
	 * to know whether the order can be fulfilled.
	 */
	async findUndeliverableLines(orderId: number): Promise<string[]> {
		const lines = await db
			.select({
				productName: orderLines.productName,
				productType: products.type,
				pinnedType: orderLines.fulfillmentType,
				pinnedAssetId: orderLines.digitalAssetId,
				currentAssetId: products.digitalAssetId
			})
			.from(orderLines)
			.innerJoin(productVariants, eq(orderLines.variantId, productVariants.id))
			.innerJoin(products, eq(productVariants.productId, products.id))
			.where(eq(orderLines.orderId, orderId));

		return lines
			.filter(
				(line) =>
					(line.pinnedType ?? line.productType) === "digital" &&
					!line.pinnedAssetId &&
					!line.currentAssetId
			)
			.map((line) => line.productName);
	}

	/**
	 * Drop grants whose window has closed. They are capabilities, not records —
	 * the order lines are the record — and holding them forever would also keep
	 * their assets undeletable. Called from scheduled housekeeping.
	 */
	async pruneExpiredGrants(graceMs = 7 * 24 * 60 * 60 * 1000): Promise<number> {
		const deleted = await db
			.delete(digitalDownloads)
			.where(lt(digitalDownloads.expiresAt, new Date(Date.now() - graceMs)))
			.returning({ id: digitalDownloads.id });

		if (deleted.length > 0) {
			console.log("[digital-delivery] expired_grants_pruned", { count: deleted.length });
		}
		return deleted.length;
	}

	/** The active download grants for an order, for the email and the thank-you page. */
	async getGrants(orderId: number): Promise<DownloadGrant[]> {
		const rows = await db
			.select({
				token: digitalDownloads.token,
				expiresAt: digitalDownloads.expiresAt,
				productName: orderLines.productName,
				fileName: assets.name
			})
			.from(digitalDownloads)
			.innerJoin(orderLines, eq(digitalDownloads.orderLineId, orderLines.id))
			.innerJoin(assets, eq(digitalDownloads.assetId, assets.id))
			.where(eq(digitalDownloads.orderId, orderId));

		return rows;
	}

	/**
	 * Send the delivery email for an order. Throws on failure so the outbox
	 * retries; the caller records the error on the order once retries run out.
	 */
	async deliverOrder(orderId: number): Promise<{ sent: number; errors: string[] }> {
		const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
		if (!order) return { sent: 0, errors: ["Order not found"] };

		const grants = await this.getGrants(orderId);
		if (grants.length === 0) return { sent: 0, errors: [] };

		if (!order.customerEmail) {
			return { sent: 0, errors: [`No customer email on order ${orderId}`] };
		}

		const origin = storeOrigin();
		const { sent } = await sendEmail(
			order.customerEmail,
			`Your download${grants.length > 1 ? "s" : ""} for order ${order.code}`,
			this.buildEmailContent({
				customerName: order.shippingFullName || "there",
				orderCode: order.code,
				origin,
				grants
			})
		);

		if (!sent) {
			return { sent: 0, errors: ["Email delivery is not configured"] };
		}

		return { sent: grants.length, errors: [] };
	}

	/**
	 * Redeem a download token: valid, unexpired, still within its use limit.
	 * Returns the asset to serve, or null when the token cannot be used.
	 */
	async redeem(
		token: string
	): Promise<{ source: string; name: string; mimeType: string } | null> {
		const [row] = await db
			.select({
				id: digitalDownloads.id,
				downloadCount: digitalDownloads.downloadCount,
				maxDownloads: digitalDownloads.maxDownloads,
				expiresAt: digitalDownloads.expiresAt,
				source: assets.source,
				name: assets.name,
				mimeType: assets.mimeType
			})
			.from(digitalDownloads)
			.innerJoin(assets, eq(digitalDownloads.assetId, assets.id))
			.where(eq(digitalDownloads.token, token))
			.limit(1);

		if (!row) return null;
		if (row.expiresAt.getTime() < Date.now()) return null;

		// Conditional increment: the count is also the concurrency guard, so
		// parallel requests can't both slip past the limit.
		const [claimed] = await db
			.update(digitalDownloads)
			.set({ downloadCount: row.downloadCount + 1 })
			.where(
				and(
					eq(digitalDownloads.id, row.id),
					eq(digitalDownloads.downloadCount, row.downloadCount),
					lt(digitalDownloads.downloadCount, digitalDownloads.maxDownloads)
				)
			)
			.returning({ id: digitalDownloads.id });

		if (!claimed) return null;

		return { source: row.source, name: row.name, mimeType: row.mimeType };
	}

	/**
	 * Build email content for digital product delivery
	 */
	private buildEmailContent(data: {
		customerName: string;
		orderCode: string;
		origin: string;
		grants: DownloadGrant[];
	}): string {
		const links = data.grants
			.map(
				(grant) =>
					`<li><a href="${data.origin}/downloads/${grant.token}">${escapeHtml(grant.productName)}</a> — ${escapeHtml(grant.fileName)}</li>`
			)
			.join("");

		const expires = data.grants[0]?.expiresAt;

		return `
			<p>Hi ${escapeHtml(data.customerName)},</p>
			<p>Thank you for your order <strong>${escapeHtml(data.orderCode)}</strong>. Your downloads are ready:</p>
			<ul>${links}</ul>
			${expires ? `<p>These links work until ${expires.toISOString().slice(0, 10)} and can be used up to ${MAX_DOWNLOADS} times.</p>` : ""}
			<p>Enjoy!</p>
		`.trim();
	}
}

function escapeHtml(value: string): string {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;");
}

// Export singleton instance
export const digitalDeliveryService = new DigitalDeliveryService();
