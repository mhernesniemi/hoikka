/**
 * Order Service
 * Handles order lifecycle, line items, and state transitions.
 *
 * The cart itself is a cookie (see $lib/server/cart-cookie.ts). An order row
 * is only created when checkout starts (`startCheckout`): the cookie lines are
 * snapshotted into order lines with prices and 15-minute stock reservations.
 * Orders with `active=true, state=created` are draft checkouts, identified by
 * the `checkout_token` cookie; they become real orders at `payment_pending`.
 */
import { eq, and, asc, desc, sql, isNull, inArray, exists } from "drizzle-orm";
import { db } from "../db/index.js";
import {
	orders,
	orderLines,
	orderPromotions,
	productVariants,
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
	OrderListItem,
	CreateOrderInput,
	OrderState,
	PaginatedResult
} from "$lib/types.js";
import { nanoid } from "nanoid";
import { reservationService } from "./reservations.js";
import { taxService, taxRateFromDb, taxRateToDb } from "./tax.js";
import { STATE_TRANSITIONS, isValidTransition } from "./order-utils.js";
import { promotionService } from "./promotions.js";
import { calculateDiscount, calculateProductDiscount } from "./promotion-utils.js";
import { categoryService } from "./categories.js";

export class OrderService {
	/**
	 * Create a new draft order
	 */
	async create(input: CreateOrderInput & { checkoutToken?: string } = {}): Promise<Order> {
		const code = this.generateOrderCode();

		const [order] = await db
			.insert(orders)
			.values({
				code,
				customerId: input.customerId ?? null,
				checkoutToken: input.checkoutToken ?? null,
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
	 * Get the draft checkout order identified by a checkout_token cookie
	 */
	async getDraftByToken(
		checkoutToken: string | null | undefined
	): Promise<OrderWithRelations | null> {
		if (!checkoutToken) return null;

		const [order] = await db
			.select()
			.from(orders)
			.where(and(eq(orders.checkoutToken, checkoutToken), eq(orders.active, true)));

		if (!order) return null;
		return this.loadOrderRelations(order);
	}

	/**
	 * Start (or resume) a checkout from cookie cart lines.
	 *
	 * This is where the cart first touches the database: it creates or reuses a
	 * draft order, snapshots prices and names into order lines, and reserves
	 * stock for 15 minutes. If the cookie no longer matches the draft's lines,
	 * the draft is wiped and rebuilt — deliberately simple reconciliation.
	 *
	 * Quantities are clamped to available stock; anything unavailable is
	 * reported in `stockErrors` (and skipped) rather than failing the whole
	 * checkout.
	 */
	async startCheckout(
		cartLines: { variantId: number; quantity: number }[],
		opts: { customerId?: number | null; checkoutToken?: string | null }
	): Promise<{
		order: OrderWithRelations;
		checkoutToken: string;
		isNew: boolean;
		stockErrors: string[];
	}> {
		// Opportunistic cleanup of expired reservations — this replaces the old
		// scheduled background job.
		await reservationService.deleteExpired();

		let [draft] = opts.checkoutToken
			? await db
					.select()
					.from(orders)
					.where(
						and(
							eq(orders.checkoutToken, opts.checkoutToken),
							eq(orders.active, true),
							eq(orders.state, "created")
						)
					)
			: [];

		let isNew = false;
		if (!draft) {
			draft = await this.create({
				customerId: opts.customerId ?? undefined,
				checkoutToken: nanoid(32)
			});
			isNew = true;
		} else if (opts.customerId && draft.customerId !== opts.customerId) {
			// Customer signed in mid-checkout — attach the draft to them
			await db
				.update(orders)
				.set({ customerId: opts.customerId })
				.where(eq(orders.id, draft.id));
		}

		const existingLines = await db
			.select()
			.from(orderLines)
			.where(eq(orderLines.orderId, draft.id));

		const linesMatch =
			existingLines.length === cartLines.length &&
			cartLines.every((cl) =>
				existingLines.some(
					(el) => el.variantId === cl.variantId && el.quantity === cl.quantity
				)
			);

		const stockErrors: string[] = [];

		if (linesMatch) {
			// Same cart as before — just refresh the 15-minute reservations
			await reservationService.releaseForOrder(draft.id);
			for (const line of existingLines) {
				await reservationService.reserve(line.variantId, draft.id, line.id, line.quantity);
			}
		} else {
			// Wipe and rebuild the draft from the cookie
			await reservationService.releaseForOrder(draft.id);
			await db.delete(orderLines).where(eq(orderLines.orderId, draft.id));

			const customerId = opts.customerId ?? null;
			const isTaxExempt = await taxService.isCustomerTaxExempt(customerId);

			for (const cartLine of cartLines) {
				const [variant] = await db
					.select()
					.from(productVariants)
					.where(
						and(
							eq(productVariants.id, cartLine.variantId),
							isNull(productVariants.deletedAt)
						)
					);
				if (!variant) {
					stockErrors.push("An item in your cart is no longer available");
					continue;
				}

				const [product] = await db
					.select()
					.from(products)
					.where(eq(products.id, variant.productId));
				const productName = product?.name || "Unknown Product";

				let quantity = cartLine.quantity;
				if (variant.trackInventory) {
					const available = await reservationService.getAvailableStock(variant.id);
					if (available <= 0) {
						stockErrors.push(`${productName}: out of stock`);
						continue;
					}
					if (quantity > available) {
						stockErrors.push(`${productName}: only ${available} available`);
						quantity = available;
					}
				}

				const taxCode = await categoryService.getProductTaxCode(variant.productId);
				const taxRate = await taxService.getTaxRate(taxCode);
				const effectivePrice = await this.resolveEffectivePrice(
					variant.price,
					variant.id,
					customerId
				);
				const lineTax = taxService.calculateLineTax(
					effectivePrice,
					quantity,
					taxRate,
					isTaxExempt
				);

				const [variantTrans] = await db
					.select()
					.from(productVariantTranslations)
					.where(eq(productVariantTranslations.variantId, variant.id))
					.limit(1);

				const [line] = await db
					.insert(orderLines)
					.values({
						orderId: draft.id,
						variantId: variant.id,
						quantity,
						unitPrice: effectivePrice,
						lineTotal: lineTax.lineTotalGross,
						taxCode,
						taxRate: taxRateToDb(taxRate),
						taxAmount: lineTax.taxAmount,
						unitPriceNet: lineTax.unitPriceNet,
						lineTotalNet: lineTax.lineTotalNet,
						productName,
						variantName: variantTrans?.name || variant.name || null,
						sku: variant.sku
					})
					.returning();

				await reservationService.reserve(variant.id, draft.id, line.id, quantity);
			}

			await this.recalculateTotals(draft.id);
		}

		const order = await this.getById(draft.id);
		if (!order) throw new Error("Failed to load checkout order");

		return { order, checkoutToken: draft.checkoutToken!, isNew, stockErrors };
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
		const conditions = state ? [eq(orders.state, state)] : [];

		const orderList = await db
			.select()
			.from(orders)
			.where(and(...conditions))
			.orderBy(desc(sql`COALESCE(${orders.orderPlacedAt}, ${orders.createdAt})`))
			.limit(limit)
			.offset(offset);

		const results = await Promise.all(orderList.map((o) => this.loadOrderRelations(o)));
		return results.filter((o) => o.lines.length > 0);
	}

	/**
	 * List orders with server-side pagination (optimized for admin list view).
	 * Uses 2 queries (count + data) instead of N+1.
	 */
	async listPaginated(
		options: {
			state?: OrderState;
			limit?: number;
			offset?: number;
			search?: string;
			sortBy?: string;
			sortOrder?: "asc" | "desc";
		} = {}
	): Promise<PaginatedResult<OrderListItem>> {
		const { state, limit = 20, offset = 0, search, sortBy, sortOrder = "desc" } = options;
		const conditions = state ? [eq(orders.state, state)] : [];

		if (search) {
			const pattern = `%${search}%`;
			conditions.push(
				sql`(${orders.code} LIKE ${pattern} OR ${orders.shippingFullName} LIKE ${pattern})`
			);
		}

		// Only include orders that have lines
		const hasLines = exists(
			db
				.select({ one: sql`1` })
				.from(orderLines)
				.where(eq(orderLines.orderId, orders.id))
		);

		// Count query
		const countResult = await db
			.select({ count: sql<number>`count(*)` })
			.from(orders)
			.where(and(...conditions, hasLines));
		const total = Number(countResult[0]?.count ?? 0);

		// Resolve sort column
		const dateFallback = sql`COALESCE(${orders.orderPlacedAt}, ${orders.createdAt})`;
		const sortColumnMap: Record<string, ReturnType<typeof sql>> = {
			code: sql`${orders.code}`,
			customer: sql`${orders.shippingFullName}`,
			state: sql`${orders.state}`,
			total: sql`${orders.total}`,
			date: dateFallback
		};
		const sortCol = (sortBy && sortColumnMap[sortBy]) || dateFallback;
		const dirFn = sortOrder === "asc" ? asc : desc;

		// Data query with line count subquery
		const items = await db
			.select({
				id: orders.id,
				code: orders.code,
				state: orders.state,
				total: orders.total,
				currencyCode: orders.currencyCode,
				shippingFullName: orders.shippingFullName,
				orderPlacedAt: orders.orderPlacedAt,
				createdAt: orders.createdAt,
				lineCount: sql<number>`(SELECT count(*) FROM order_lines WHERE order_id = ${orders.id})`
			})
			.from(orders)
			.where(and(...conditions, hasLines))
			.orderBy(dirFn(sortCol))
			.limit(limit)
			.offset(offset);

		return {
			items: items.map((item) => ({ ...item, lineCount: Number(item.lineCount) })),
			pagination: { total, limit, offset, hasMore: offset + items.length < total }
		};
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

		const updateData: Partial<Order> = {
			state: newState
		};

		// When transitioning to payment_pending, the draft becomes a real order.
		// Reservations were refreshed at checkout entry, so the 15-minute window
		// still covers payment; the final stock check happens at "paid".
		if (newState === "payment_pending") {
			updateData.active = false;
			if (!order.orderPlacedAt) {
				updateData.orderPlacedAt = new Date();
			}
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
