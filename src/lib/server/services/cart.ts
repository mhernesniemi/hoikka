/**
 * Cart read model.
 *
 * The cart itself is a cookie (see $lib/server/cart-cookie.ts); this service
 * turns cookie lines into a priced view in a handful of batched queries.
 * Nothing here writes to the database — the first write happens at checkout
 * (orderService.startCheckout).
 */
import { eq, and, sql, isNull, inArray, gt } from "drizzle-orm";
import { db } from "../db/index.js";
import {
	products,
	productVariants,
	assets,
	stockReservations,
	customerGroupMembers,
	productVariantGroupPrices
} from "../db/schema.js";
import type { CartLine } from "../cart-cookie.js";
import { taxService } from "./tax.js";
import { categoryService } from "./categories.js";
import { promotionService } from "./promotions.js";
import { calculateDiscount, calculateProductDiscount } from "./promotion-utils.js";

export interface CartViewLine {
	variantId: number;
	productId: number;
	productName: string;
	variantName: string | null;
	sku: string;
	imageUrl: string | null;
	unitPrice: number;
	quantity: number;
	lineTotal: number;
	taxAmount: number;
	// Full tax breakdown so startCheckout can snapshot lines from this view —
	// cart display and checkout share one pricing computation
	taxCode: string;
	taxRate: number;
	unitPriceNet: number;
	lineTotalNet: number;
	/** Available stock, or null when inventory is not tracked */
	available: number | null;
	outOfStock: boolean;
}

export interface CartViewPromotion {
	title: string;
	discountAmount: number;
}

export interface CartView {
	lines: CartViewLine[];
	itemCount: number;
	subtotal: number;
	discount: number;
	taxTotal: number;
	total: number;
	isTaxExempt: boolean;
	promotions: CartViewPromotion[];
}

const EMPTY_CART: CartView = {
	lines: [],
	itemCount: 0,
	subtotal: 0,
	discount: 0,
	taxTotal: 0,
	total: 0,
	isTaxExempt: false,
	promotions: []
};

/** Displayed quantity: the cookie quantity clamped to what is actually available. */
export function clampToAvailable(quantity: number, available: number | null): number {
	if (available === null) return quantity;
	return Math.max(0, Math.min(quantity, available));
}

export async function getCartView(
	cartLines: CartLine[],
	customerId: number | null,
	opts: { skipPromotions?: boolean } = {}
): Promise<CartView> {
	if (cartLines.length === 0) return EMPTY_CART;

	const variantIds = cartLines.map((l) => l.variantId);

	// One query: variants joined to products and the featured-image fallback chain
	// (variant image > product featured asset > featured variant image > first variant image)
	const rows = await db
		.select({
			variantId: productVariants.id,
			productId: products.id,
			productName: products.name,
			variantName: productVariants.name,
			sku: productVariants.sku,
			price: productVariants.price,
			stock: productVariants.stock,
			trackInventory: productVariants.trackInventory,
			imageUrl: sql<string | null>`COALESCE(
				${productVariants.imageUrl},
				${assets.source},
				(SELECT pv.image_url FROM product_variants pv WHERE pv.product_id = ${products.id} AND pv.is_featured = true AND pv.image_url IS NOT NULL AND pv.deleted_at IS NULL LIMIT 1),
				(SELECT pv.image_url FROM product_variants pv WHERE pv.product_id = ${products.id} AND pv.image_url IS NOT NULL AND pv.deleted_at IS NULL ORDER BY pv.id ASC LIMIT 1)
			)`
		})
		.from(productVariants)
		.innerJoin(products, eq(productVariants.productId, products.id))
		.leftJoin(assets, eq(products.featuredAssetId, assets.id))
		.where(
			and(
				inArray(productVariants.id, variantIds),
				isNull(productVariants.deletedAt),
				isNull(products.deletedAt)
			)
		);
	const variantById = new Map(rows.map((r) => [r.variantId, r]));

	// Group prices (logged-in customers only): lowest matching group price wins
	const groupPriceByVariant = new Map<number, number>();
	if (customerId) {
		const memberships = await db
			.select({ groupId: customerGroupMembers.groupId })
			.from(customerGroupMembers)
			.where(eq(customerGroupMembers.customerId, customerId));

		if (memberships.length > 0) {
			const groupPrices = await db
				.select({
					variantId: productVariantGroupPrices.variantId,
					price: productVariantGroupPrices.price
				})
				.from(productVariantGroupPrices)
				.where(
					and(
						inArray(productVariantGroupPrices.variantId, variantIds),
						inArray(
							productVariantGroupPrices.groupId,
							memberships.map((m) => m.groupId)
						)
					)
				);
			for (const gp of groupPrices) {
				const existing = groupPriceByVariant.get(gp.variantId);
				if (existing === undefined || gp.price < existing) {
					groupPriceByVariant.set(gp.variantId, gp.price);
				}
			}
		}
	}

	// Active (non-expired) reservations per variant, one grouped query
	const reservedRows = await db
		.select({
			variantId: stockReservations.variantId,
			reserved: sql<number>`SUM(${stockReservations.quantity})`
		})
		.from(stockReservations)
		.where(
			and(
				inArray(stockReservations.variantId, variantIds),
				gt(stockReservations.expiresAt, new Date())
			)
		)
		.groupBy(stockReservations.variantId);
	const reservedByVariant = new Map(reservedRows.map((r) => [r.variantId, Number(r.reserved)]));

	const isTaxExempt = await taxService.isCustomerTaxExempt(customerId);

	// Tax rates, cached per product/tax code within this call
	const taxCodeByProduct = new Map<number, string>();
	const rateByCode = new Map<string, number>();

	const lines: CartViewLine[] = [];
	for (const cartLine of cartLines) {
		const variant = variantById.get(cartLine.variantId);
		if (!variant) continue; // variant was deleted — drop silently

		const available = variant.trackInventory
			? Math.max(0, variant.stock - (reservedByVariant.get(variant.variantId) ?? 0))
			: null;
		const quantity = clampToAvailable(cartLine.quantity, available);

		let taxCode = taxCodeByProduct.get(variant.productId);
		if (taxCode === undefined) {
			taxCode = await categoryService.getProductTaxCode(variant.productId);
			taxCodeByProduct.set(variant.productId, taxCode);
		}
		let taxRate = rateByCode.get(taxCode);
		if (taxRate === undefined) {
			taxRate = await taxService.getTaxRate(taxCode);
			rateByCode.set(taxCode, taxRate);
		}

		const unitPrice = Math.min(
			variant.price,
			groupPriceByVariant.get(variant.variantId) ?? Infinity
		);
		const lineTax = taxService.calculateLineTax(unitPrice, quantity, taxRate, isTaxExempt);

		lines.push({
			variantId: variant.variantId,
			productId: variant.productId,
			productName: variant.productName,
			variantName: variant.variantName,
			sku: variant.sku,
			imageUrl: variant.imageUrl,
			unitPrice,
			quantity,
			lineTotal: lineTax.lineTotalGross,
			taxAmount: lineTax.taxAmount,
			taxCode,
			taxRate,
			unitPriceNet: lineTax.unitPriceNet,
			lineTotalNet: lineTax.lineTotalNet,
			available,
			outOfStock: quantity === 0
		});
	}

	const activeLines = lines.filter((l) => !l.outOfStock);
	const subtotal = activeLines.reduce((sum, l) => sum + l.lineTotal, 0);
	const taxTotal = isTaxExempt ? 0 : activeLines.reduce((sum, l) => sum + l.taxAmount, 0);

	// Automatic promotions, computed for display only — persisted at checkout
	const appliedPromotions: CartViewPromotion[] = [];
	if (subtotal > 0 && !opts.skipPromotions) {
		const autoPromos = await promotionService.listActiveAutomatic();
		for (const promo of autoPromos) {
			if (promo.promotionType === "free_shipping") continue; // needs a shipping cost

			const validation = await promotionService.validateAutomatic(promo, subtotal, {
				customerId: customerId ?? undefined
			});
			if (!validation.valid) continue;

			let amount: number;
			if (promo.promotionType === "product") {
				const qualifyingProductIds = await promotionService.getQualifyingProductIds(
					promo.id
				);
				const qualifyingTotal = activeLines
					.filter(
						(l) =>
							qualifyingProductIds === null ||
							qualifyingProductIds.includes(l.productId)
					)
					.reduce((sum, l) => sum + l.lineTotal, 0);
				amount = calculateProductDiscount(promo, qualifyingTotal);
			} else {
				amount = calculateDiscount(promo, subtotal);
			}

			if (amount > 0) {
				appliedPromotions.push({
					title: promo.title ?? promo.code ?? "Discount",
					discountAmount: amount
				});
			}
		}
	}

	const discount = appliedPromotions.reduce((sum, p) => sum + p.discountAmount, 0);

	return {
		lines,
		itemCount: activeLines.reduce((sum, l) => sum + l.quantity, 0),
		subtotal,
		discount,
		taxTotal,
		total: Math.max(0, subtotal - discount),
		isTaxExempt,
		promotions: appliedPromotions
	};
}
