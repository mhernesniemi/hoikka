/**
 * Integration tests for digital fulfilment: a purchase must produce a usable,
 * bounded download grant, and a digital product with no file must surface as
 * a fulfilment error rather than a silently empty delivery.
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("$env/dynamic/private", () => ({ env: { DATABASE_URL: ":memory:" } }));
vi.mock("$app/environment", () => ({ dev: true, browser: false, building: false }));

import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { assets, digitalDownloads, orderLines, products, productVariants } from "../db/schema.js";
import { orderService } from "./orders.js";
import { paymentService } from "./payments/index.js";
import { completeCheckout } from "./checkout-completion.js";
import { digitalDeliveryService } from "./digitalDelivery.js";
import { isOrderDigitalOnly } from "./checkout-completion.js";
import { assetService } from "./assets.js";
import { productService } from "./products.js";
import type { Cookies } from "@sveltejs/kit";

let counter = 0;

const noopCookies = {
	get: () => undefined,
	set: () => {},
	delete: () => {}
} as unknown as Cookies;

async function makeDigitalProduct(opts: { withFile: boolean }) {
	counter++;
	let assetId: number | null = null;
	if (opts.withFile) {
		const [asset] = await db
			.insert(assets)
			.values({
				name: `guide-${counter}.pdf`,
				type: "document",
				mimeType: "application/pdf",
				source: `/uploads/digital/guide-${counter}.pdf`,
				fileSize: 1234
			})
			.returning();
		assetId = asset.id;
	}

	const [product] = await db
		.insert(products)
		.values({
			name: `Digital ${counter}`,
			slug: `digital-${counter}`,
			type: "digital",
			digitalAssetId: assetId
		})
		.returning();
	const [variant] = await db
		.insert(productVariants)
		.values({
			productId: product.id,
			sku: `DIG-${counter}`,
			price: 2500,
			stock: 0,
			trackInventory: false
		})
		.returning();

	return { product, variant, assetId };
}

async function buy(variantId: number) {
	const { order } = await orderService.startCheckout([{ variantId, quantity: 1 }], {});
	const draft = (await orderService.getById(order.id))!;
	await orderService.setCustomerEmail(draft.id, "buyer@test.local");
	const method = await paymentService.getMethodByCode("mock");
	const fresh = (await orderService.getById(draft.id))!;
	const { payment } = await paymentService.createPayment(fresh, method!.id);
	const result = await completeCheckout({
		order: fresh,
		payment,
		customerId: null,
		saveToAddressBook: false,
		cookies: noopCookies
	});
	return { orderId: draft.id, result };
}

describe("digital fulfilment", () => {
	it("grants a download for each digital line after payment", async () => {
		const { variant } = await makeDigitalProduct({ withFile: true });

		const { orderId, result } = await buy(variant.id);

		expect(result.completed).toBe(true);
		const grants = await digitalDeliveryService.getGrants(orderId);
		expect(grants).toHaveLength(1);
		expect(grants[0].token.length).toBeGreaterThan(20);
		expect(grants[0].fileName).toMatch(/\.pdf$/);
		expect(grants[0].expiresAt.getTime()).toBeGreaterThan(Date.now());
	});

	it("refuses to sell a digital product that has no file", async () => {
		const { variant } = await makeDigitalProduct({ withFile: false });
		const { order } = await orderService.startCheckout(
			[{ variantId: variant.id, quantity: 1 }],
			{}
		);

		// This is what checkout checks before creating any payment
		const undeliverable = await digitalDeliveryService.findUndeliverableLines(order.id);
		expect(undeliverable).toHaveLength(1);
	});

	it("refuses to settle when the file vanished during confirmation", async () => {
		// Deliverability is re-checked at settlement, not only when the payment
		// was created — an admin can pull the file while a confirmation is in
		// flight. Nothing is captured and the order never becomes paid.
		const { variant } = await makeDigitalProduct({ withFile: false });

		const { orderId, result } = await buy(variant.id);

		expect(result.completed).toBe(false);
		expect(result.completed === false && result.error).toContain("not been charged");

		const order = await orderService.getById(orderId);
		expect(order!.state).not.toBe("paid");
		expect(await digitalDeliveryService.getGrants(orderId)).toHaveLength(0);
	});

	it("delivers the file it was sold with, even if the product changes after", async () => {
		// The check-then-act race: an admin detaches the file between the
		// pre-payment check and fulfilment. Pinning the asset to the line at
		// payment time means the order no longer depends on the product's
		// current state at all.
		const { variant, assetId, product } = await makeDigitalProduct({ withFile: true });
		const { order } = await orderService.startCheckout(
			[{ variantId: variant.id, quantity: 1 }],
			{}
		);

		// Payment creation pins the deliverable
		const { undeliverable } = await digitalDeliveryService.snapshotDeliverables(order.id);
		expect(undeliverable).toHaveLength(0);

		// ...then the admin detaches it from the product
		await productService.setDigitalAsset(product.id, null);

		// The order still knows what it sold
		expect(await digitalDeliveryService.findUndeliverableLines(order.id)).toHaveLength(0);
		const grants = await digitalDeliveryService.createGrants(order.id);
		expect(grants.errors).toHaveLength(0);
		expect(grants.granted).toBe(1);

		const [issued] = await digitalDeliveryService.getGrants(order.id);
		const redeemed = await digitalDeliveryService.redeem(issued.token);
		expect(redeemed).not.toBeNull();

		const [line] = await db.select().from(orderLines).where(eq(orderLines.orderId, order.id));
		expect(line.digitalAssetId).toBe(assetId);
	});

	it("does not re-pin a line that was already sold with a different file", async () => {
		const { variant, assetId, product } = await makeDigitalProduct({ withFile: true });
		const { order } = await orderService.startCheckout(
			[{ variantId: variant.id, quantity: 1 }],
			{}
		);
		await digitalDeliveryService.snapshotDeliverables(order.id);

		// The product is given a different file afterwards
		const [replacement] = await db
			.insert(assets)
			.values({
				name: "replacement.pdf",
				type: "document",
				mimeType: "application/pdf",
				source: "/uploads/_private/digital/replacement.pdf"
			})
			.returning();
		await productService.setDigitalAsset(product.id, replacement.id);

		await digitalDeliveryService.snapshotDeliverables(order.id);

		const [line] = await db.select().from(orderLines).where(eq(orderLines.orderId, order.id));
		expect(line.digitalAssetId).toBe(assetId);
	});

	it("keeps an asset that customers still hold downloads for", async () => {
		const { variant, assetId } = await makeDigitalProduct({ withFile: true });
		await buy(variant.id);

		// Still attached to the product
		await expect(assetService.delete(assetId!)).rejects.toThrow(/deliverable/i);

		// Detached from the product, but an order was sold with it
		const [owner] = await db
			.select()
			.from(products)
			.where(eq(products.digitalAssetId, assetId!));
		await productService.setDigitalAsset(owner.id, null);
		await expect(assetService.delete(assetId!)).rejects.toThrow(/sold on an existing order/i);

		// Even once every link has expired and been swept, the line still pins
		// the file — that pin is what a download grant is recreated from.
		await db
			.update(digitalDownloads)
			.set({ expiresAt: new Date(Date.now() - 1000) })
			.where(eq(digitalDownloads.assetId, assetId!));
		await digitalDeliveryService.pruneExpiredGrants(0);
		await expect(assetService.delete(assetId!)).rejects.toThrow(/sold on an existing order/i);
	});

	it("protects a file that is pinned to a line but has no grant yet", async () => {
		// The window the pin exists to close: payment pinned the file, the grant
		// has not been written, and the product has already been detached.
		const { variant, assetId, product } = await makeDigitalProduct({ withFile: true });
		const { order } = await orderService.startCheckout(
			[{ variantId: variant.id, quantity: 1 }],
			{}
		);
		await digitalDeliveryService.snapshotDeliverables(order.id);
		await productService.setDigitalAsset(product.id, null);

		expect(await digitalDeliveryService.getGrants(order.id)).toHaveLength(0);
		await expect(assetService.delete(assetId!)).rejects.toThrow(/sold on an existing order/i);
	});

	it("still ships a physical line after the product is flipped to digital", async () => {
		// The mirror of the digital→physical case: fulfilment must not decide
		// an order is download-only because the product changed after the sale,
		// skip the shipment, and find nothing pinned to deliver instead.
		const [product] = await db
			.insert(products)
			.values({ name: "Chair", slug: `chair-${Date.now()}`, type: "physical" })
			.returning();
		const [variant] = await db
			.insert(productVariants)
			.values({ productId: product.id, sku: `CHR-${Date.now()}`, price: 4900, stock: 5 })
			.returning();
		const { order } = await orderService.startCheckout(
			[{ variantId: variant.id, quantity: 1 }],
			{}
		);

		// Sold as physical, and pinned as such at payment time
		await digitalDeliveryService.snapshotDeliverables(order.id);
		expect(await isOrderDigitalOnly(order.id)).toBe(false);

		// The product becomes digital, with a file, after the sale
		const [asset] = await db
			.insert(assets)
			.values({
				name: "late.pdf",
				type: "document",
				mimeType: "application/pdf",
				source: "/uploads/_private/digital/late.pdf"
			})
			.returning();
		await db
			.update(products)
			.set({ type: "digital", digitalAssetId: asset.id })
			.where(eq(products.id, product.id));

		// The order still owes a shipment, not a download
		expect(await isOrderDigitalOnly(order.id)).toBe(false);
		const grants = await digitalDeliveryService.createGrants(order.id);
		expect(grants.granted).toBe(0);
	});

	it("still grants a download after the product is flipped to physical", async () => {
		const { variant, product } = await makeDigitalProduct({ withFile: true });
		const { order } = await orderService.startCheckout(
			[{ variantId: variant.id, quantity: 1 }],
			{}
		);
		await digitalDeliveryService.snapshotDeliverables(order.id);

		// The product stops being digital after the sale
		await db.update(products).set({ type: "physical" }).where(eq(products.id, product.id));

		const grants = await digitalDeliveryService.createGrants(order.id);

		expect(grants.errors).toHaveLength(0);
		expect(grants.granted).toBe(1);
		expect(await digitalDeliveryService.getGrants(order.id)).toHaveLength(1);
	});

	it("does not issue a second grant when completion is retried", async () => {
		const { variant } = await makeDigitalProduct({ withFile: true });
		const { orderId } = await buy(variant.id);

		await digitalDeliveryService.createGrants(orderId);

		expect(await digitalDeliveryService.getGrants(orderId)).toHaveLength(1);
	});
});

describe("download token redemption", () => {
	it("resolves the asset and counts the use", async () => {
		const { variant } = await makeDigitalProduct({ withFile: true });
		const { orderId } = await buy(variant.id);
		const [grant] = await digitalDeliveryService.getGrants(orderId);

		const redeemed = await digitalDeliveryService.redeem(grant.token);

		expect(redeemed?.source).toMatch(/^\/uploads\/digital\//);
		expect(redeemed?.mimeType).toBe("application/pdf");
		const [row] = await db
			.select()
			.from(digitalDownloads)
			.where(eq(digitalDownloads.token, grant.token));
		expect(row.downloadCount).toBe(1);
	});

	it("rejects an unknown token", async () => {
		expect(await digitalDeliveryService.redeem("not-a-real-token")).toBeNull();
	});

	it("rejects an expired token", async () => {
		const { variant } = await makeDigitalProduct({ withFile: true });
		const { orderId } = await buy(variant.id);
		const [grant] = await digitalDeliveryService.getGrants(orderId);

		await db
			.update(digitalDownloads)
			.set({ expiresAt: new Date(Date.now() - 1000) })
			.where(eq(digitalDownloads.token, grant.token));

		expect(await digitalDeliveryService.redeem(grant.token)).toBeNull();
	});

	it("stops at the download limit", async () => {
		const { variant } = await makeDigitalProduct({ withFile: true });
		const { orderId } = await buy(variant.id);
		const [grant] = await digitalDeliveryService.getGrants(orderId);

		await db
			.update(digitalDownloads)
			.set({ maxDownloads: 2, downloadCount: 0 })
			.where(eq(digitalDownloads.token, grant.token));

		expect(await digitalDeliveryService.redeem(grant.token)).not.toBeNull();
		expect(await digitalDeliveryService.redeem(grant.token)).not.toBeNull();
		expect(await digitalDeliveryService.redeem(grant.token)).toBeNull();
	});
});
