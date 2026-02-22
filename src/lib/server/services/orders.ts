/**
 * Order Service
 * Handles order lifecycle, line items, and state transitions
 *
 * Cart Pattern (following Vendure):
 * - Orders with `active=true` are carts (can be modified)
 * - Orders with `active=false` are completed orders
 * - Guest users get a `cartToken` stored in cookies
 * - Logged-in users have carts linked to `customerId`
 */
import { eq, and, desc, sql, isNull, inArray } from "drizzle-orm";
import { db } from "../db/index.js";
import {
	orders,
	orderLines,
	orderPromotions,
	productVariants,
	productTranslations,
	productVariantTranslations,
	promotions,
	orderShipping,
	products,
	assets,
	customers,
	productVariantGroupPrices,
	customerGroupMembers
} from "../db/schema.js";
import type {
	Order,
	OrderWithRelations,
	OrderLine,
	CreateOrderInput,
	AddOrderLineInput,
	OrderState
} from "$lib/types.js";
import { nanoid } from "nanoid";
import { reservationService } from "./reservations.js";
import { taxService } from "./tax.js";
import { STATE_TRANSITIONS, isValidTransition } from "./order-utils.js";
import { promotionService } from "./promotions.js";
import { calculateDiscount, calculateProductDiscount } from "./promotion-utils.js";
import { categoryService } from "./categories.js";
import { withSpan } from "../telemetry.js";

// Generate a secure cart token for guest users
function generateCartToken(): string {
	return nanoid(32);
}

export class OrderService {
	/**
	 * Create a new order/cart
	 */
	async create(input: CreateOrderInput & { cartToken?: string } = {}): Promise<Order> {
		const code = this.generateOrderCode();

		const [order] = await db
			.insert(orders)
			.values({
				code,
				customerId: input.customerId ?? null,
				cartToken: input.cartToken ?? null,
				active: true,
				state: "created",
				currencyCode: input.currencyCode ?? "EUR",
				subtotal: 0,
				shipping: 0,
				discount: 0,
				total: 0
			})
			.returning();

		return order;
	}

	/**
	 * Get or create an active cart for a customer or guest
	 * Returns { order, cartToken } - cartToken is set for new guest carts
	 */
	async getOrCreateActiveCart(options: {
		customerId?: number | null;
		cartToken?: string | null;
	}): Promise<{ order: OrderWithRelations; cartToken: string | null; isNew: boolean }> {
		const { customerId, cartToken } = options;

		// Try to find existing active cart
		let order: Order | undefined;

		if (customerId) {
			// Logged-in user: find by customerId
			[order] = await db
				.select()
				.from(orders)
				.where(and(eq(orders.customerId, customerId), eq(orders.active, true)));
		} else if (cartToken) {
			// Guest user: find by cartToken
			[order] = await db
				.select()
				.from(orders)
				.where(and(eq(orders.cartToken, cartToken), eq(orders.active, true)));
		}

		if (order) {
			return {
				order: await this.loadOrderRelations(order),
				cartToken: order.cartToken,
				isNew: false
			};
		}

		// Create new cart
		const newCartToken = customerId ? null : generateCartToken();
		const newOrder = await this.create({
			customerId: customerId ?? undefined,
			cartToken: newCartToken ?? undefined
		});

		return {
			order: await this.loadOrderRelations(newOrder),
			cartToken: newCartToken,
			isNew: true
		};
	}

	/**
	 * Get active cart without creating one
	 */
	async getActiveCart(options: {
		customerId?: number | null;
		cartToken?: string | null;
	}): Promise<OrderWithRelations | null> {
		const { customerId, cartToken } = options;

		let order: Order | undefined;

		if (customerId) {
			[order] = await db
				.select()
				.from(orders)
				.where(and(eq(orders.customerId, customerId), eq(orders.active, true)));
		} else if (cartToken) {
			[order] = await db
				.select()
				.from(orders)
				.where(and(eq(orders.cartToken, cartToken), eq(orders.active, true)));
		}

		if (!order) return null;
		return this.loadOrderRelations(order);
	}

	/**
	 * Transfer guest cart to customer (on login)
	 * Merges items if customer already has an active cart
	 */
	async transferCartToCustomer(cartToken: string, customerId: number): Promise<Order | null> {
		// Get guest cart
		const [guestCart] = await db
			.select()
			.from(orders)
			.where(and(eq(orders.cartToken, cartToken), eq(orders.active, true)));

		if (!guestCart) return null;

		// Check if customer already has an active cart
		const [existingCart] = await db
			.select()
			.from(orders)
			.where(and(eq(orders.customerId, customerId), eq(orders.active, true)));

		if (existingCart) {
			// Merge guest cart items into existing cart
			const guestLines = await db
				.select()
				.from(orderLines)
				.where(eq(orderLines.orderId, guestCart.id));

			for (const line of guestLines) {
				await this.addLine(existingCart.id, {
					variantId: line.variantId,
					quantity: line.quantity
				});
			}

			// Delete the guest cart
			await db.delete(orders).where(eq(orders.id, guestCart.id));

			return existingCart;
		} else {
			// Transfer ownership of guest cart to customer
			const [updated] = await db
				.update(orders)
				.set({
					customerId,
					cartToken: null // Clear guest token
				})
				.where(eq(orders.id, guestCart.id))
				.returning();

			return updated;
		}
	}

	/**
	 * Get order by ID with all relations
	 */
	async getById(id: number): Promise<OrderWithRelations | null> {
		const [order] = await db.select().from(orders).where(eq(orders.id, id));

		if (!order) return null;

		return this.loadOrderRelations(order);
	}

	/**
	 * Get order by code
	 */
	async getByCode(code: string): Promise<OrderWithRelations | null> {
		const [order] = await db.select().from(orders).where(eq(orders.code, code));

		if (!order) return null;

		return this.loadOrderRelations(order);
	}

	/**
	 * List orders for a customer (excludes active carts by default)
	 */
	async listForCustomer(
		customerId: number,
		options: { includeActive?: boolean; limit?: number; offset?: number } = {}
	): Promise<OrderWithRelations[]> {
		const { includeActive = false, limit = 20, offset = 0 } = options;

		const conditions = [eq(orders.customerId, customerId)];
		if (!includeActive) {
			conditions.push(eq(orders.active, false));
		}

		const orderList = await db
			.select()
			.from(orders)
			.where(and(...conditions))
			.orderBy(desc(orders.createdAt))
			.limit(limit)
			.offset(offset);

		return Promise.all(orderList.map((o) => this.loadOrderRelations(o)));
	}

	/**
	 * List all orders with optional state filter
	 */
	async list(state?: OrderState, limit = 20, offset = 0): Promise<OrderWithRelations[]> {
		const conditions = [eq(orders.active, false)];
		if (state) {
			conditions.push(eq(orders.state, state));
		}

		const orderList = await db
			.select()
			.from(orders)
			.where(and(...conditions))
			.orderBy(desc(orders.createdAt))
			.limit(limit)
			.offset(offset);

		return Promise.all(orderList.map((o) => this.loadOrderRelations(o)));
	}

	/**
	 * Add a line item to the order (cart must be active)
	 */
	async addLine(orderId: number, input: AddOrderLineInput): Promise<OrderLine> {
		const order = await this.getById(orderId);
		if (!order) throw new Error("Order not found");
		if (!order.active) throw new Error("Cannot modify completed order");

		// Get variant with current price
		const [variant] = await db
			.select()
			.from(productVariants)
			.where(eq(productVariants.id, input.variantId));

		if (!variant) throw new Error("Variant not found");

		// Find existing line early (needed for both stock check and upsert)
		const existingLine = order.lines.find((l) => l.variantId === input.variantId);

		// Check stock availability using reservations (only for tracked variants)
		if (variant.trackInventory) {
			const availableStock = await reservationService.getAvailableStockExcludingOrder(
				input.variantId,
				orderId
			);
			const existingQuantity = existingLine?.quantity ?? 0;
			const totalQuantity = existingQuantity + input.quantity;

			if (totalQuantity > availableStock) {
				throw new Error(
					`Only ${availableStock} items available${existingQuantity > 0 ? ` (${existingQuantity} already in cart)` : ""}`
				);
			}
		}

		// Get product with taxCode
		const [product] = await db
			.select()
			.from(products)
			.where(eq(products.id, variant.productId));

		// Get product name for snapshot
		const [productTrans] = await db
			.select()
			.from(productTranslations)
			.where(eq(productTranslations.productId, variant.productId))
			.limit(1);

		// Get variant name
		const [variantTrans] = await db
			.select()
			.from(productVariantTranslations)
			.where(eq(productVariantTranslations.variantId, variant.id))
			.limit(1);

		// Get tax rate from product's category
		const taxCode = await categoryService.getProductTaxCode(variant.productId);
		const taxRate = await taxService.getTaxRate(taxCode);
		const isTaxExempt = await taxService.isCustomerTaxExempt(order.customerId);

		// Resolve group-specific price (lowest of base price and any matching group prices)
		const effectivePrice = await this.resolveEffectivePrice(
			variant.price,
			variant.id,
			order.customerId
		);

		// Update existing line or create new one
		if (existingLine) {
			// Update quantity and recalculate tax
			const newQuantity = existingLine.quantity + input.quantity;
			const lineTax = taxService.calculateLineTax(
				effectivePrice,
				newQuantity,
				taxRate,
				isTaxExempt
			);

			const [updated] = await db
				.update(orderLines)
				.set({
					quantity: newQuantity,
					lineTotal: lineTax.lineTotalGross,
					unitPriceNet: lineTax.unitPriceNet,
					lineTotalNet: lineTax.lineTotalNet,
					taxAmount: lineTax.taxAmount
				})
				.where(eq(orderLines.id, existingLine.id))
				.returning();

			// Update reservation quantity
			await reservationService.updateQuantity(existingLine.id, newQuantity);

			await this.recalculateTotals(orderId);
			return updated;
		}

		// Calculate tax for new line
		const lineTax = taxService.calculateLineTax(
			effectivePrice,
			input.quantity,
			taxRate,
			isTaxExempt
		);

		// Create new line with tax info
		const [line] = await db
			.insert(orderLines)
			.values({
				orderId,
				variantId: input.variantId,
				quantity: input.quantity,
				unitPrice: effectivePrice,
				lineTotal: lineTax.lineTotalGross,
				taxCode,
				taxRate: taxRate.toString(),
				taxAmount: lineTax.taxAmount,
				unitPriceNet: lineTax.unitPriceNet,
				lineTotalNet: lineTax.lineTotalNet,
				productName: productTrans?.name || product?.name || "Unknown Product",
				variantName: variantTrans?.name || variant.name || null,
				sku: variant.sku
			})
			.returning();

		// Create reservation for the new line
		await reservationService.reserve(input.variantId, orderId, line.id, input.quantity);

		await this.recalculateTotals(orderId);
		return line;
	}

	/**
	 * Update line quantity
	 */
	async updateLineQuantity(
		orderId: number,
		lineId: number,
		quantity: number
	): Promise<OrderLine> {
		const order = await this.getById(orderId);
		if (!order) throw new Error("Order not found");
		if (!order.active) throw new Error("Cannot modify completed order");

		if (quantity <= 0) {
			await this.removeLine(orderId, lineId);
			throw new Error("Line removed due to zero quantity");
		}

		const [line] = await db.select().from(orderLines).where(eq(orderLines.id, lineId));

		if (!line) throw new Error("Line not found");

		// Check stock availability using reservations (only for tracked variants)
		const [lineVariant] = await db
			.select({ trackInventory: productVariants.trackInventory })
			.from(productVariants)
			.where(eq(productVariants.id, line.variantId));

		if (lineVariant?.trackInventory) {
			const availableStock = await reservationService.getAvailableStockExcludingOrder(
				line.variantId,
				orderId
			);

			if (quantity > availableStock) {
				throw new Error(`Only ${availableStock} items available`);
			}
		}

		// Recalculate tax for new quantity
		const taxRate = parseFloat(line.taxRate);
		const isTaxExempt = await taxService.isCustomerTaxExempt(order.customerId);
		const lineTax = taxService.calculateLineTax(line.unitPrice, quantity, taxRate, isTaxExempt);

		const [updated] = await db
			.update(orderLines)
			.set({
				quantity,
				lineTotal: lineTax.lineTotalGross,
				lineTotalNet: lineTax.lineTotalNet,
				taxAmount: lineTax.taxAmount
			})
			.where(eq(orderLines.id, lineId))
			.returning();

		// Update reservation quantity
		await reservationService.updateQuantity(lineId, quantity);

		await this.recalculateTotals(orderId);
		return updated;
	}

	/**
	 * Remove a line item
	 */
	async removeLine(orderId: number, lineId: number): Promise<void> {
		const order = await this.getById(orderId);
		if (!order) throw new Error("Order not found");
		if (!order.active) throw new Error("Cannot modify completed order");

		// Release reservation for this line
		await reservationService.release(lineId);

		await db.delete(orderLines).where(eq(orderLines.id, lineId));
		await this.recalculateTotals(orderId);
	}

	/**
	 * Apply a promotion code
	 */
	async applyPromotion(
		orderId: number,
		code: string,
		customerId?: number
	): Promise<{ success: boolean; message: string }> {
		const order = await this.getById(orderId);
		if (!order) return { success: false, message: "Order not found" };
		if (!order.active) return { success: false, message: "Cannot modify completed order" };

		// Get existing applied promotions for combination checking
		const existingApplied = await db
			.select()
			.from(orderPromotions)
			.where(eq(orderPromotions.orderId, orderId));

		const existingPromotionIds = existingApplied.map((op) => op.promotionId);

		// Validate using promotion service (handles dates, limits, combinations, per-customer)
		const validation = await promotionService.validate(code, order.subtotal, {
			customerId,
			existingPromotionIds
		});

		if (!validation.valid || !validation.promotion) {
			return { success: false, message: validation.error ?? "Invalid promotion code" };
		}

		const promotion = validation.promotion;

		// Calculate discount based on promotion type
		let discountAmount = 0;
		let orderPromotionType: "order" | "product" | "shipping" = "order";

		if (promotion.promotionType === "free_shipping") {
			// Free shipping: discount = current shipping cost
			const [shippingRecord] = await db
				.select()
				.from(orderShipping)
				.where(eq(orderShipping.orderId, orderId))
				.limit(1);
			discountAmount = shippingRecord?.price ?? 0;
			orderPromotionType = "shipping";
		} else if (promotion.promotionType === "product") {
			// Product-level discount: only qualifying lines
			const qualifyingProductIds = await promotionService.getQualifyingProductIds(
				promotion.id
			);

			// Get order lines with their product IDs
			const linesWithProducts = await db
				.select({
					lineTotal: orderLines.lineTotal,
					productId: products.id
				})
				.from(orderLines)
				.innerJoin(productVariants, eq(orderLines.variantId, productVariants.id))
				.innerJoin(products, eq(productVariants.productId, products.id))
				.where(eq(orderLines.orderId, orderId));

			const qualifyingLineTotal = linesWithProducts
				.filter(
					(l) =>
						qualifyingProductIds === null || qualifyingProductIds.includes(l.productId)
				)
				.reduce((sum, l) => sum + l.lineTotal, 0);

			if (qualifyingLineTotal === 0) {
				return {
					success: false,
					message: "No qualifying products in your cart"
				};
			}

			discountAmount = calculateProductDiscount(promotion, qualifyingLineTotal);
			orderPromotionType = "product";
		} else {
			// Order-level discount
			discountAmount = calculateDiscount(promotion, order.subtotal);
			orderPromotionType = "order";
		}

		// Apply promotion
		await db
			.insert(orderPromotions)
			.values({
				orderId,
				promotionId: promotion.id,
				discountAmount,
				type: orderPromotionType
			})
			.onConflictDoNothing();

		console.log("[order] promotion_applied", {
			orderId,
			promotionId: promotion.id,
			code,
			discountAmount,
			type: orderPromotionType
		});

		await this.recalculateTotals(orderId);

		return { success: true, message: `Discount of ${discountAmount / 100} applied` };
	}

	/**
	 * Remove a specific promotion from an order
	 */
	async removePromotion(orderId: number, promotionId: number): Promise<void> {
		await db
			.delete(orderPromotions)
			.where(
				and(
					eq(orderPromotions.orderId, orderId),
					eq(orderPromotions.promotionId, promotionId)
				)
			);

		await this.recalculateTotals(orderId);
	}

	/**
	 * Remove all promotions from an order
	 */
	async removeAllPromotions(orderId: number): Promise<void> {
		await db.delete(orderPromotions).where(eq(orderPromotions.orderId, orderId));

		await this.recalculateTotals(orderId);
	}

	/**
	 * Get applied promotions for an order with promotion details
	 */
	async getAppliedPromotions(orderId: number) {
		return db
			.select({
				promotionId: orderPromotions.promotionId,
				discountAmount: orderPromotions.discountAmount,
				type: orderPromotions.type,
				code: promotions.code,
				title: promotions.title,
				method: promotions.method,
				promotionType: promotions.promotionType
			})
			.from(orderPromotions)
			.innerJoin(promotions, eq(orderPromotions.promotionId, promotions.id))
			.where(eq(orderPromotions.orderId, orderId));
	}

	/**
	 * Transition order to a new state
	 */
	async transitionState(orderId: number, newState: OrderState): Promise<Order> {
		const order = await this.getById(orderId);
		if (!order) throw new Error("Order not found");

		const currentState = order.state;

		if (!isValidTransition(currentState, newState)) {
			console.warn("[order] invalid_transition", {
				orderId,
				from: currentState,
				to: newState
			});
			throw new Error(`Cannot transition from ${currentState} to ${newState}`);
		}

		return withSpan(
			"order.transition",
			async () => {
				const updateData: Partial<Order> = {
					state: newState
				};

				// When transitioning to payment_pending, mark cart as no longer active (becomes an order)
				if (newState === "payment_pending") {
					updateData.active = false;
					if (!order.orderPlacedAt) {
						updateData.orderPlacedAt = new Date();
					}
					// Extend reservations during checkout (additional 15 minutes)
					await reservationService.extendForOrder(orderId);
				}

				const [updated] = await db
					.update(orders)
					.set(updateData)
					.where(eq(orders.id, orderId))
					.returning();

				// Update promotion usage counts when order is paid
				if (newState === "paid") {
					// Validate stock one final time before payment completion
					const stockCheck = await this.validateStock(orderId);
					if (!stockCheck.valid) {
						throw new Error(`Stock unavailable: ${stockCheck.errors.join(", ")}`);
					}

					const appliedPromotions = await db
						.select()
						.from(orderPromotions)
						.where(eq(orderPromotions.orderId, orderId));

					for (const op of appliedPromotions) {
						await db
							.update(promotions)
							.set({ usageCount: sql`${promotions.usageCount} + 1` })
							.where(eq(promotions.id, op.promotionId));
					}

					// Decrease stock for tracked variants
					for (const line of order.lines) {
						const [v] = await db
							.select({ trackInventory: productVariants.trackInventory })
							.from(productVariants)
							.where(eq(productVariants.id, line.variantId));
						if (v?.trackInventory) {
							await db
								.update(productVariants)
								.set({
									stock: sql`${productVariants.stock} - ${line.quantity}`
								})
								.where(eq(productVariants.id, line.variantId));
						}
					}

					// Release reservations since stock has been permanently deducted
					await reservationService.releaseForOrder(orderId);
				}

				// Handle cancellation
				if (newState === "cancelled") {
					// If order was paid, restore stock for tracked variants
					if (currentState === "paid" || currentState === "shipped") {
						for (const line of order.lines) {
							const [v] = await db
								.select({ trackInventory: productVariants.trackInventory })
								.from(productVariants)
								.where(eq(productVariants.id, line.variantId));
							if (v?.trackInventory) {
								await db
									.update(productVariants)
									.set({
										stock: sql`${productVariants.stock} + ${line.quantity}`
									})
									.where(eq(productVariants.id, line.variantId));
							}
						}
					}
					// Release any remaining reservations
					await reservationService.releaseForOrder(orderId);
				}

				return updated;
			},
			{
				"order.id": orderId,
				"order.from_state": currentState,
				"order.to_state": newState,
				"order.total": order.total
			}
		);
	}

	/**
	 * Set shipping address
	 */
	async setShippingAddress(
		orderId: number,
		address: {
			fullName: string;
			streetLine1: string;
			streetLine2?: string;
			city: string;
			postalCode: string;
			country: string;
		}
	): Promise<Order> {
		const [updated] = await db
			.update(orders)
			.set({
				shippingFullName: address.fullName,
				shippingStreetLine1: address.streetLine1,
				shippingStreetLine2: address.streetLine2 ?? null,
				shippingCity: address.city,
				shippingPostalCode: address.postalCode,
				shippingCountry: address.country
			})
			.where(eq(orders.id, orderId))
			.returning();

		return updated;
	}

	/**
	 * Set customer email for order confirmations and digital delivery
	 */
	async setCustomerEmail(orderId: number, email: string): Promise<Order> {
		const [updated] = await db
			.update(orders)
			.set({ customerEmail: email })
			.where(eq(orders.id, orderId))
			.returning();

		return updated;
	}

	/**
	 * Validate stock availability for all items in the order
	 * Uses reservation system to check available stock
	 */
	async validateStock(orderId: number): Promise<{ valid: boolean; errors: string[] }> {
		const order = await this.getById(orderId);
		if (!order) return { valid: false, errors: ["Order not found"] };

		const errors: string[] = [];

		for (const line of order.lines) {
			const [variant] = await db
				.select()
				.from(productVariants)
				.where(eq(productVariants.id, line.variantId));

			if (!variant) {
				errors.push(`${line.productName} is no longer available`);
			} else if (variant.trackInventory) {
				// Check available stock excluding this order's reservations (only for tracked variants)
				const availableStock = await reservationService.getAvailableStockExcludingOrder(
					line.variantId,
					orderId
				);
				if (line.quantity > availableStock) {
					errors.push(`${line.productName}: only ${availableStock} available`);
				}
			}
		}

		return { valid: errors.length === 0, errors };
	}

	/**
	 * Recalculate order totals (subtotal, discount, shipping, total)
	 * Call this after modifying order lines, promotions, or shipping
	 */
	async updateTotals(orderId: number): Promise<void> {
		await this.recalculateTotals(orderId);
	}

	/**
	 * Apply qualifying automatic promotions and remove ones that no longer qualify
	 */
	async applyAutomaticPromotions(orderId: number): Promise<void> {
		const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
		if (!order || !order.active) return;

		const lines = await db.select().from(orderLines).where(eq(orderLines.orderId, orderId));
		const subtotal = lines.reduce((sum, line) => sum + line.lineTotal, 0);
		if (subtotal === 0) return;

		// Get currently applied promotions
		const applied = await db
			.select()
			.from(orderPromotions)
			.where(eq(orderPromotions.orderId, orderId));

		const appliedPromoIds = applied.map((op) => op.promotionId);

		// Get active automatic promotions
		const autoPromos = await promotionService.listActiveAutomatic();

		// Remove automatic promotions that no longer qualify
		for (const ap of applied) {
			const promo = autoPromos.find((p) => p.id === ap.promotionId);
			if (!promo) {
				// Check if this was an automatic promo that's no longer active
				const [fullPromo] = await db
					.select()
					.from(promotions)
					.where(eq(promotions.id, ap.promotionId));
				if (fullPromo?.method === "automatic") {
					await db
						.delete(orderPromotions)
						.where(
							and(
								eq(orderPromotions.orderId, orderId),
								eq(orderPromotions.promotionId, ap.promotionId)
							)
						);
					continue;
				}
			}
			if (promo) {
				// Re-validate: check min order amount
				const validation = await promotionService.validateAutomatic(promo, subtotal, {
					customerId: order.customerId ?? undefined,
					existingPromotionIds: appliedPromoIds.filter((id) => id !== promo.id)
				});
				if (!validation.valid) {
					await db
						.delete(orderPromotions)
						.where(
							and(
								eq(orderPromotions.orderId, orderId),
								eq(orderPromotions.promotionId, promo.id)
							)
						);
				} else {
					// Recalculate discount amount for the current subtotal
					let newAmount = 0;
					if (promo.promotionType === "product") {
						const qualifyingProductIds = await promotionService.getQualifyingProductIds(
							promo.id
						);
						const linesWithProducts = await db
							.select({
								lineTotal: orderLines.lineTotal,
								productId: products.id
							})
							.from(orderLines)
							.innerJoin(
								productVariants,
								eq(orderLines.variantId, productVariants.id)
							)
							.innerJoin(products, eq(productVariants.productId, products.id))
							.where(eq(orderLines.orderId, orderId));

						const qualifyingLineTotal = linesWithProducts
							.filter(
								(l) =>
									qualifyingProductIds === null ||
									qualifyingProductIds.includes(l.productId)
							)
							.reduce((sum, l) => sum + l.lineTotal, 0);

						newAmount = calculateProductDiscount(promo, qualifyingLineTotal);
					} else if (promo.promotionType !== "free_shipping") {
						newAmount = calculateDiscount(promo, subtotal);
					}

					// Update if the amount changed (skip shipping — handled in recalculateTotals)
					if (
						promo.promotionType !== "free_shipping" &&
						newAmount !== ap.discountAmount
					) {
						await db
							.update(orderPromotions)
							.set({ discountAmount: newAmount })
							.where(
								and(
									eq(orderPromotions.orderId, orderId),
									eq(orderPromotions.promotionId, promo.id)
								)
							);
					}
				}
			}
		}

		// Re-fetch applied after removals
		const currentApplied = await db
			.select()
			.from(orderPromotions)
			.where(eq(orderPromotions.orderId, orderId));
		const currentAppliedIds = currentApplied.map((op) => op.promotionId);

		// Try to apply new automatic promotions
		for (const promo of autoPromos) {
			if (currentAppliedIds.includes(promo.id)) continue;

			const validation = await promotionService.validateAutomatic(promo, subtotal, {
				customerId: order.customerId ?? undefined,
				existingPromotionIds: currentAppliedIds
			});

			if (!validation.valid) continue;

			// Calculate discount
			let discountAmount = 0;
			let orderPromotionType: "order" | "product" | "shipping" = "order";

			if (promo.promotionType === "free_shipping") {
				const [shippingRecord] = await db
					.select()
					.from(orderShipping)
					.where(eq(orderShipping.orderId, orderId))
					.limit(1);
				discountAmount = shippingRecord?.price ?? 0;
				orderPromotionType = "shipping";
			} else if (promo.promotionType === "product") {
				const qualifyingProductIds = await promotionService.getQualifyingProductIds(
					promo.id
				);
				const linesWithProducts = await db
					.select({
						lineTotal: orderLines.lineTotal,
						productId: products.id
					})
					.from(orderLines)
					.innerJoin(productVariants, eq(orderLines.variantId, productVariants.id))
					.innerJoin(products, eq(productVariants.productId, products.id))
					.where(eq(orderLines.orderId, orderId));

				const qualifyingLineTotal = linesWithProducts
					.filter(
						(l) =>
							qualifyingProductIds === null ||
							qualifyingProductIds.includes(l.productId)
					)
					.reduce((sum, l) => sum + l.lineTotal, 0);

				if (qualifyingLineTotal === 0) continue;

				discountAmount = calculateProductDiscount(promo, qualifyingLineTotal);
				orderPromotionType = "product";
			} else {
				discountAmount = calculateDiscount(promo, subtotal);
				orderPromotionType = "order";
			}

			if (discountAmount <= 0) continue;

			await db
				.insert(orderPromotions)
				.values({
					orderId,
					promotionId: promo.id,
					discountAmount,
					type: orderPromotionType
				})
				.onConflictDoNothing();

			currentAppliedIds.push(promo.id);
		}
	}

	// ============================================================================
	// PRIVATE HELPERS
	// ============================================================================

	private async resolveEffectivePrice(
		variantPrice: number,
		variantId: number,
		customerId: number | null
	): Promise<number> {
		if (!customerId) return variantPrice;

		// Get customer's group memberships
		const memberships = await db
			.select({ groupId: customerGroupMembers.groupId })
			.from(customerGroupMembers)
			.where(eq(customerGroupMembers.customerId, customerId));

		if (memberships.length === 0) return variantPrice;

		const groupIds = memberships.map((m) => m.groupId);

		// Get matching group prices for this variant
		const groupPrices = await db
			.select({ price: productVariantGroupPrices.price })
			.from(productVariantGroupPrices)
			.where(
				and(
					eq(productVariantGroupPrices.variantId, variantId),
					inArray(productVariantGroupPrices.groupId, groupIds)
				)
			);

		if (groupPrices.length === 0) return variantPrice;

		// Return the lowest of all matching group prices and the base price
		const allPrices = [variantPrice, ...groupPrices.map((gp) => gp.price)];
		return Math.min(...allPrices);
	}

	private async loadOrderRelations(order: Order): Promise<OrderWithRelations> {
		// Join order lines with variant -> product -> featured asset to get images
		// Priority: variant's own image > product featured asset > featured variant image > first variant image
		const linesWithImages = await db
			.select({
				line: orderLines,
				imageUrl: sql<string | null>`COALESCE(
					${productVariants.imageUrl},
					${assets.source},
					(SELECT pv.image_url FROM product_variants pv WHERE pv.product_id = ${products.id} AND pv.is_featured = true AND pv.image_url IS NOT NULL AND pv.deleted_at IS NULL LIMIT 1),
					(SELECT pv.image_url FROM product_variants pv WHERE pv.product_id = ${products.id} AND pv.image_url IS NOT NULL AND pv.deleted_at IS NULL ORDER BY pv.id ASC LIMIT 1)
				)`,
				productId: productVariants.productId,
				currentProductName: products.name,
				currentVariantName: productVariants.name
			})
			.from(orderLines)
			.leftJoin(productVariants, eq(orderLines.variantId, productVariants.id))
			.leftJoin(products, eq(productVariants.productId, products.id))
			.leftJoin(assets, eq(products.featuredAssetId, assets.id))
			.where(eq(orderLines.orderId, order.id));

		return {
			...order,
			lines: linesWithImages.map(
				({ line, imageUrl, productId, currentProductName, currentVariantName }) => ({
					...line,
					productName: currentProductName || line.productName || "",
					variantName: currentVariantName || line.variantName || null,
					variant: null,
					imageUrl: imageUrl ?? null,
					productId: productId ?? null
				})
			),
			payments: [], // Load payments separately if needed
			customer: null
		};
	}

	private async recalculateTotals(orderId: number, skipAutoPromotions = false): Promise<void> {
		// Apply automatic promotions first (unless we're called from within applyAutomaticPromotions)
		if (!skipAutoPromotions) {
			await this.applyAutomaticPromotions(orderId);
		}

		// Get all lines
		const lines = await db.select().from(orderLines).where(eq(orderLines.orderId, orderId));

		const subtotal = lines.reduce((sum, line) => sum + line.lineTotal, 0);
		const taxTotal = lines.reduce((sum, line) => sum + line.taxAmount, 0);
		const subtotalNet = lines.reduce((sum, line) => sum + line.lineTotalNet, 0);

		// Get applied discounts
		const appliedPromotions = await db
			.select()
			.from(orderPromotions)
			.where(eq(orderPromotions.orderId, orderId));

		// Recalculate code-based promotion amounts (automatic promos are handled in applyAutomaticPromotions)
		for (const ap of appliedPromotions) {
			if (ap.type === "shipping") continue;

			const [promo] = await db
				.select()
				.from(promotions)
				.where(eq(promotions.id, ap.promotionId));
			if (!promo || promo.method !== "code") continue;

			let newAmount = 0;
			if (promo.promotionType === "product") {
				const qualifyingProductIds = await promotionService.getQualifyingProductIds(
					promo.id
				);
				const linesWithProducts = await db
					.select({
						lineTotal: orderLines.lineTotal,
						productId: products.id
					})
					.from(orderLines)
					.innerJoin(productVariants, eq(orderLines.variantId, productVariants.id))
					.innerJoin(products, eq(productVariants.productId, products.id))
					.where(eq(orderLines.orderId, orderId));

				const qualifyingLineTotal = linesWithProducts
					.filter(
						(l) =>
							qualifyingProductIds === null ||
							qualifyingProductIds.includes(l.productId)
					)
					.reduce((sum, l) => sum + l.lineTotal, 0);

				newAmount = calculateProductDiscount(promo, qualifyingLineTotal);
			} else {
				newAmount = calculateDiscount(promo, subtotal);
			}

			if (newAmount !== ap.discountAmount) {
				await db
					.update(orderPromotions)
					.set({ discountAmount: newAmount })
					.where(
						and(
							eq(orderPromotions.orderId, orderId),
							eq(orderPromotions.promotionId, promo.id)
						)
					);
				ap.discountAmount = newAmount;
			}
		}

		// Split discounts: order/product vs shipping
		const orderProductDiscount = appliedPromotions
			.filter((op) => op.type === "order" || op.type === "product")
			.reduce((sum, op) => sum + op.discountAmount, 0);
		const shippingDiscount = appliedPromotions
			.filter((op) => op.type === "shipping")
			.reduce((sum, op) => sum + op.discountAmount, 0);

		// Get shipping cost from order_shipping table
		const [shippingRecord] = await db
			.select()
			.from(orderShipping)
			.where(eq(orderShipping.orderId, orderId))
			.limit(1);
		const rawShipping = shippingRecord?.price ?? 0;

		// Update free shipping promo amounts when shipping method changes
		if (shippingDiscount > 0) {
			const shippingPromos = appliedPromotions.filter((op) => op.type === "shipping");
			for (const sp of shippingPromos) {
				if (sp.discountAmount !== rawShipping) {
					await db
						.update(orderPromotions)
						.set({ discountAmount: rawShipping })
						.where(
							and(
								eq(orderPromotions.orderId, orderId),
								eq(orderPromotions.promotionId, sp.promotionId)
							)
						);
				}
			}
		}

		// Recalculate shipping discount after potential update
		const effectiveShippingDiscount = appliedPromotions.some((op) => op.type === "shipping")
			? rawShipping
			: 0;
		const effectiveShipping = Math.max(0, rawShipping - effectiveShippingDiscount);
		const discount = orderProductDiscount + effectiveShippingDiscount;

		// Get order to check tax exemption status
		const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
		const isTaxExempt = order ? await taxService.isCustomerTaxExempt(order.customerId) : false;

		const total = Math.max(0, subtotal - orderProductDiscount + effectiveShipping);
		const totalNet = isTaxExempt
			? total
			: Math.max(0, subtotalNet - orderProductDiscount + effectiveShipping);

		await db
			.update(orders)
			.set({
				subtotal,
				discount,
				shipping: effectiveShipping,
				total,
				taxTotal: isTaxExempt ? 0 : taxTotal,
				totalNet,
				isTaxExempt
			})
			.where(eq(orders.id, orderId));
	}

	private generateOrderCode(): string {
		// Generate a unique order code like "ORD-XXXXX"
		return `ORD-${nanoid(8).toUpperCase()}`;
	}
}

// Export singleton instance
export const orderService = new OrderService();
