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
import { eq, and, desc, lt, sql, inArray, exists } from "drizzle-orm";
import { db, atomic } from "../db/index.js";
import { paginationOf, resolveSort } from "../pagination.js";
import {
	orders,
	orderLines,
	orderPromotions,
	promotionUsages,
	productVariants,
	promotions,
	orderShipping,
	products,
	assets
} from "../db/schema.js";
import type {
	Order,
	OrderWithRelations,
	OrderListItem,
	CreateOrderInput,
	OrderState,
	PaginatedResult
} from "$lib/types.js";
import type { BatchItem } from "drizzle-orm/batch";
import { nanoid } from "nanoid";
import { reservationService } from "./reservations.js";
import { taxService, taxRateFromDb, taxRateToDb } from "./tax.js";
import { STATE_TRANSITIONS, isValidTransition, calculateOrderTotals } from "./order-utils.js";
import { promotionService } from "./promotions.js";
import { calculateDiscount } from "./promotion-utils.js";
import { getCartView } from "./cart.js";

// Abandoned checkout drafts are swept after this long. Long enough that a
// shopper who wanders off mid-checkout still finds their cart, short enough
// that unauthenticated draft creation can't grow the table without bound.
const STALE_DRAFT_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * "Only while the order is still in this state." Used to hang every ledger
 * write of a state transition off the transition itself, so they commit
 * together or not at all.
 */
/** Which part of fulfilment a recorded problem belongs to. */
export type FulfillmentIssueSource = "settlement" | "shipment" | "downloads" | "delivery-email";

const ISSUE_LABELS: Record<FulfillmentIssueSource, string> = {
	settlement: "Settlement",
	shipment: "Shipment",
	downloads: "Downloads",
	"delivery-email": "Delivery email"
};

/**
 * Merge one source's problem into the stored set, as `Label: message` lines.
 * Returns null when nothing is left to report.
 */
export function mergeFulfillmentIssue(
	current: string | null,
	source: FulfillmentIssueSource,
	message: string | null
): string | null {
	const prefix = `${ISSUE_LABELS[source]}: `;
	const kept = (current ?? "")
		.split("\n")
		.map((line) => line.trim())
		.filter((line) => line.length > 0 && !line.startsWith(prefix));

	if (message) kept.push(`${prefix}${message}`);
	return kept.length > 0 ? kept.join("\n") : null;
}

function stateGuard(guard: { orderId: number; state: OrderState }) {
	return sql`exists (select 1 from ${orders} where ${orders.id} = ${guard.orderId} and ${orders.state} = ${guard.state})`;
}
import { bumpCatalogVersion } from "$lib/server/edge-cache.js";

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
	 * The order a checkout token points at, whatever state it reached. Unlike
	 * getDraftByToken this still finds an order that has already been paid —
	 * which is exactly the case when a payment webhook completed the purchase
	 * while the shopper's browser was still finishing its own request.
	 */
	async getByCheckoutToken(
		checkoutToken: string | null | undefined
	): Promise<OrderWithRelations | null> {
		if (!checkoutToken) return null;

		const [order] = await db
			.select()
			.from(orders)
			.where(eq(orders.checkoutToken, checkoutToken));

		if (!order) return null;
		return this.loadOrderRelations(order);
	}

	/** Cheap existence check for a draft token — no relations loaded. */
	async draftExists(checkoutToken: string | null | undefined): Promise<boolean> {
		if (!checkoutToken) return false;

		const [order] = await db
			.select({ id: orders.id })
			.from(orders)
			.where(and(eq(orders.checkoutToken, checkoutToken), eq(orders.active, true)))
			.limit(1);

		return !!order;
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
		// Expired reservations must go before stock is read, so this one stays
		// on the request path. The abandoned-draft sweep does not — it runs on
		// the scheduled drain (see integrations/scheduler.ts), so a checkout
		// never pays for someone else's housekeeping.
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
			// Wipe and rebuild the draft from the cookie. Prices, names, and tax
			// come from getCartView — the same batched computation the cart sheet
			// shows, so what the customer saw is exactly what gets snapshotted.
			await reservationService.releaseForOrder(draft.id);

			const view = await getCartView(cartLines, opts.customerId ?? null, {
				skipPromotions: true
			});
			const viewByVariant = new Map(view.lines.map((l) => [l.variantId, l]));

			const lineValues = [];
			for (const cartLine of cartLines) {
				const line = viewByVariant.get(cartLine.variantId);
				if (!line) {
					stockErrors.push("An item in your cart is no longer available");
					continue;
				}
				if (line.outOfStock) {
					stockErrors.push(`${line.productName}: out of stock`);
					continue;
				}
				if (line.quantity < cartLine.quantity) {
					stockErrors.push(`${line.productName}: only ${line.quantity} available`);
				}

				lineValues.push({
					orderId: draft.id,
					variantId: line.variantId,
					quantity: line.quantity,
					unitPrice: line.unitPrice,
					lineTotal: line.lineTotal,
					taxCode: line.taxCode,
					taxRate: taxRateToDb(line.taxRate),
					taxAmount: line.taxAmount,
					unitPriceNet: line.unitPriceNet,
					lineTotalNet: line.lineTotalNet,
					productName: line.productName,
					variantName: line.variantName,
					sku: line.sku
				});
			}

			// One atomic wipe-and-rebuild so a mid-sequence failure can't leave a
			// half-built draft.
			await atomic([
				db.delete(orderLines).where(eq(orderLines.orderId, draft.id)),
				...(lineValues.length > 0 ? [db.insert(orderLines).values(lineValues)] : [])
			]);

			const insertedLines = await db
				.select({
					id: orderLines.id,
					variantId: orderLines.variantId,
					quantity: orderLines.quantity
				})
				.from(orderLines)
				.where(eq(orderLines.orderId, draft.id));
			for (const inserted of insertedLines) {
				await reservationService.reserve(
					inserted.variantId,
					draft.id,
					inserted.id,
					inserted.quantity
				);
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
		const orderByExpr = resolveSort(
			{
				code: sql`${orders.code}`,
				customer: sql`${orders.shippingFullName}`,
				state: sql`${orders.state}`,
				total: sql`${orders.total}`,
				date: dateFallback
			},
			sortBy,
			sortOrder,
			dateFallback
		);

		// Data query with item count subquery
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
				itemCount: sql<number>`(${db
					.select({ value: sql`COALESCE(sum(${orderLines.quantity}), 0)` })
					.from(orderLines)
					.where(eq(orderLines.orderId, orders.id))})`
			})
			.from(orders)
			.where(and(...conditions, hasLines))
			.orderBy(orderByExpr)
			.limit(limit)
			.offset(offset);

		return {
			items: items.map((item) => ({ ...item, itemCount: Number(item.itemCount) })),
			pagination: paginationOf(total, limit, offset, items.length)
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

		const { amount: discountAmount, type: orderPromotionType } =
			await this.computePromotionDiscount(promotion, orderId, order.subtotal);

		if (orderPromotionType === "product" && discountAmount === 0) {
			return { success: false, message: "No qualifying products in your cart" };
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
		await this.deleteOrderPromotion(orderId, promotionId);
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

		// Validate BEFORE any write: a failure here must never leave the order
		// half-transitioned (previously "paid" was persisted first, so a stock
		// failure produced a paid order whose stock was never deducted).
		if (newState === "paid") {
			const stockCheck = await this.validateStock(orderId);
			if (!stockCheck.valid) {
				throw new Error(`Stock unavailable: ${stockCheck.errors.join(", ")}`);
			}
		}

		// The state change and the ledger it implies — inventory, promotion usage
		// — go in as ONE transaction. Every ledger statement is guarded on the
		// order still being in `currentState`, and the state change itself comes
		// last, so within the transaction all the guards still see the old
		// state. Two concurrent completions (a payment webhook racing the
		// browser return) therefore resolve cleanly: the loser's guards all fail
		// and it writes nothing at all, rather than deducting stock twice or —
		// as before — committing "paid" and then crashing before the stock ever
		// moved.
		const guard = { orderId, state: currentState };
		const ledger: BatchItem<"sqlite">[] = [];

		if (newState === "paid") {
			const appliedPromotions = await db
				.select()
				.from(orderPromotions)
				.where(eq(orderPromotions.orderId, orderId));

			ledger.push(
				...appliedPromotions.map((op) =>
					db
						.update(promotions)
						.set({ usageCount: sql`${promotions.usageCount} + 1` })
						.where(and(eq(promotions.id, op.promotionId), stateGuard(guard)))
				),
				// The per-customer ledger row, written in the same transaction so
				// the limit is enforced by the database rather than by a count
				// two concurrent checkouts can both read as "one left".
				...(order.customerId
					? appliedPromotions.map((op) =>
							db
								.insert(promotionUsages)
								.values({
									promotionId: op.promotionId,
									customerId: order.customerId!,
									orderId
								})
								.onConflictDoNothing()
						)
					: []),
				...(await this.stockAdjustments(order.lines, -1, guard))
			);
		}

		// Restore stock when a paid/shipped order is cancelled
		if (newState === "cancelled" && (currentState === "paid" || currentState === "shipped")) {
			ledger.push(...(await this.stockAdjustments(order.lines, 1, guard)));
		}

		await atomic([
			...ledger,
			db
				.update(orders)
				.set(updateData)
				.where(and(eq(orders.id, orderId), eq(orders.state, currentState)))
		]);

		// atomic() cannot report which statements matched, so confirm the
		// outcome afterwards. Losing the race is not an error the caller has to
		// undo — the winner did the same work — but failing to arrive at the
		// target state is.
		const updated = await this.getById(orderId);
		if (updated?.state !== newState) {
			throw new Error(
				`Order ${orderId} was transitioned concurrently — aborting ${currentState} → ${newState}`
			);
		}

		if (newState === "paid" || newState === "cancelled") {
			// Reservations have served their purpose: stock is either
			// permanently deducted or given back.
			await reservationService.releaseForOrder(orderId);
		}

		// Stock changed — cached storefront pages must re-render
		if (newState === "paid" || newState === "cancelled") {
			await bumpCatalogVersion();
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
	 * Delete checkout drafts nobody came back to. Only untouched "created"
	 * carts are removed; anything that reached payment_pending or beyond is a
	 * real order and is never swept. Child rows (lines, reservations, payments,
	 * shipping, promotions) cascade.
	 *
	 * Runs from the scheduled drain, not from checkout. Backed by
	 * `orders_draft_sweep_idx` on (state, active, updatedAt).
	 */
	async deleteStaleDrafts(olderThanMs = STALE_DRAFT_TTL_MS, limit = 500): Promise<number> {
		const cutoff = new Date(Date.now() - olderThanMs);

		// Bounded per run: a backlog is worked off over successive ticks rather
		// than in one statement that could hold the database for seconds.
		const stale = await db
			.select({ id: orders.id })
			.from(orders)
			.where(
				and(
					eq(orders.state, "created"),
					eq(orders.active, true),
					lt(orders.updatedAt, cutoff)
				)
			)
			.limit(limit);

		if (stale.length === 0) return 0;

		const deleted = await db
			.delete(orders)
			.where(
				inArray(
					orders.id,
					stale.map((o) => o.id)
				)
			)
			.returning({ id: orders.id });

		if (deleted.length > 0) {
			console.log("[order] stale_drafts_deleted", { count: deleted.length });
		}
		return deleted.length;
	}

	/**
	 * Re-check every promotion applied to an order and drop the ones that no
	 * longer qualify — disabled since, expired, or their usage limit reached
	 * while the shopper was still in checkout. A code applied ten minutes ago is
	 * not a right to that discount now, and the total has to reflect what the
	 * store will actually honour *before* a payment is created for it.
	 *
	 * Returns the titles of anything removed, so checkout can say why the total
	 * moved.
	 */
	async revalidatePromotions(orderId: number, customerId?: number | null): Promise<string[]> {
		const order = await this.getById(orderId);
		if (!order) return [];

		const applied = await db
			.select()
			.from(orderPromotions)
			.where(eq(orderPromotions.orderId, orderId));
		if (applied.length === 0) return [];

		const removed: string[] = [];

		for (const op of applied) {
			const [promotion] = await db
				.select()
				.from(promotions)
				.where(eq(promotions.id, op.promotionId));

			const stillValid =
				promotion &&
				promotion.enabled &&
				!(promotion.startsAt && promotion.startsAt > new Date()) &&
				!(promotion.endsAt && promotion.endsAt < new Date()) &&
				!(promotion.usageLimit !== null && promotion.usageCount >= promotion.usageLimit) &&
				!(await this.exceedsPerCustomerLimit(promotion, customerId));

			if (stillValid) continue;

			await db
				.delete(orderPromotions)
				.where(
					and(
						eq(orderPromotions.orderId, orderId),
						eq(orderPromotions.promotionId, op.promotionId)
					)
				);
			removed.push(promotion?.title || promotion?.code || "A promotion");
		}

		if (removed.length > 0) {
			console.log("[order] promotions_revalidated", { orderId, removed });
			await this.updateTotals(orderId);
		}

		return removed;
	}

	private async exceedsPerCustomerLimit(
		promotion: { id: number; usageLimitPerCustomer: number | null },
		customerId?: number | null
	): Promise<boolean> {
		if (!promotion.usageLimitPerCustomer || !customerId) return false;
		const used = await promotionService.getCustomerUsageCount(promotion.id, customerId);
		return used >= promotion.usageLimitPerCustomer;
	}

	/**
	 * Record (or clear) one post-payment fulfilment problem.
	 *
	 * Several independent things can go wrong after the money is taken — the
	 * shipment, a missing digital file, the delivery email — and each is fixed
	 * (or not) on its own. They are therefore stored as one owned line per
	 * source rather than as a single string, so a delivery email that finally
	 * goes through cannot erase the alert about a file that is still missing.
	 * Passing `null` clears only that source's line.
	 */
	async setFulfillmentIssue(
		orderId: number,
		source: FulfillmentIssueSource,
		message: string | null
	): Promise<void> {
		const [order] = await db
			.select({ fulfillmentError: orders.fulfillmentError })
			.from(orders)
			.where(eq(orders.id, orderId));
		if (!order) return;

		const next = mergeFulfillmentIssue(order.fulfillmentError, source, message);
		if (next === order.fulfillmentError) return;

		await db.update(orders).set({ fulfillmentError: next }).where(eq(orders.id, orderId));
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
	 * Build stock update statements (±quantity) for the tracked variants among
	 * the given lines. One lookup for all lines; execute the result via atomic().
	 */
	private async stockAdjustments(
		lines: { variantId: number; quantity: number }[],
		direction: 1 | -1,
		/** Only apply while the order is still in this state (see transitionState). */
		guard?: { orderId: number; state: OrderState }
	) {
		if (lines.length === 0) return [];
		const tracked = await db
			.select({ id: productVariants.id })
			.from(productVariants)
			.where(
				and(
					inArray(
						productVariants.id,
						lines.map((l) => l.variantId)
					),
					eq(productVariants.trackInventory, true)
				)
			);
		const trackedIds = new Set(tracked.map((t) => t.id));
		return lines
			.filter((line) => trackedIds.has(line.variantId))
			.map((line) =>
				db
					.update(productVariants)
					.set({ stock: sql`${productVariants.stock} + ${direction * line.quantity}` })
					.where(
						guard
							? and(eq(productVariants.id, line.variantId), stateGuard(guard))
							: eq(productVariants.id, line.variantId)
					)
			);
	}

	/**
	 * Recalculate order totals (subtotal, discount, shipping, total)
	 * Call this after modifying order lines, promotions, or shipping
	 */
	async updateTotals(orderId: number): Promise<void> {
		await this.recalculateTotals(orderId);
	}

	/**
	 * Apply qualifying automatic promotions and remove or update ones that no
	 * longer qualify. Amount math lives in computePromotionDiscount.
	 */
	async applyAutomaticPromotions(orderId: number): Promise<void> {
		const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
		if (!order || !order.active) return;

		const lines = await db.select().from(orderLines).where(eq(orderLines.orderId, orderId));
		const subtotal = lines.reduce((sum, line) => sum + line.lineTotal, 0);
		if (subtotal === 0) return;

		const applied = await db
			.select()
			.from(orderPromotions)
			.where(eq(orderPromotions.orderId, orderId));
		const appliedPromoIds = applied.map((op) => op.promotionId);

		const autoPromos = await promotionService.listActiveAutomatic();

		// Remove automatic promotions that are no longer active or valid;
		// update amounts for ones that still qualify
		for (const ap of applied) {
			const promo = autoPromos.find((p) => p.id === ap.promotionId);

			if (!promo) {
				// Not in the active set — remove it if it was an automatic promo
				const [fullPromo] = await db
					.select()
					.from(promotions)
					.where(eq(promotions.id, ap.promotionId));
				if (fullPromo?.method === "automatic") {
					await this.deleteOrderPromotion(orderId, ap.promotionId);
				}
				continue;
			}

			const validation = await promotionService.validateAutomatic(promo, subtotal, {
				customerId: order.customerId ?? undefined,
				existingPromotionIds: appliedPromoIds.filter((id) => id !== promo.id)
			});
			if (!validation.valid) {
				await this.deleteOrderPromotion(orderId, promo.id);
				continue;
			}

			// Shipping amounts are reconciled in recalculateTotals
			if (promo.promotionType === "free_shipping") continue;

			const { amount } = await this.computePromotionDiscount(promo, orderId, subtotal);
			if (amount !== ap.discountAmount) {
				await db
					.update(orderPromotions)
					.set({ discountAmount: amount })
					.where(
						and(
							eq(orderPromotions.orderId, orderId),
							eq(orderPromotions.promotionId, promo.id)
						)
					);
			}
		}

		// Apply newly qualifying automatic promotions
		const currentApplied = await db
			.select()
			.from(orderPromotions)
			.where(eq(orderPromotions.orderId, orderId));
		const currentAppliedIds = currentApplied.map((op) => op.promotionId);

		for (const promo of autoPromos) {
			if (currentAppliedIds.includes(promo.id)) continue;

			const validation = await promotionService.validateAutomatic(promo, subtotal, {
				customerId: order.customerId ?? undefined,
				existingPromotionIds: currentAppliedIds
			});
			if (!validation.valid) continue;

			const { amount, type } = await this.computePromotionDiscount(promo, orderId, subtotal);
			if (amount <= 0) continue;

			await db
				.insert(orderPromotions)
				.values({ orderId, promotionId: promo.id, discountAmount: amount, type })
				.onConflictDoNothing();

			currentAppliedIds.push(promo.id);
		}
	}

	// ============================================================================
	// PRIVATE HELPERS
	// ============================================================================

	/**
	 * Compute the current discount amount (and order-promotion type) for a
	 * promotion against an order. The single source of truth for promo math —
	 * used when applying codes, applying automatic promotions, and
	 * recalculating totals.
	 */
	private async computePromotionDiscount(
		promo: {
			id: number;
			promotionType: string | null;
			discountType: "percentage" | "fixed_amount";
			discountValue: number;
		},
		orderId: number,
		subtotal: number
	): Promise<{ amount: number; type: "order" | "product" | "shipping" }> {
		if (promo.promotionType === "free_shipping") {
			const [shippingRecord] = await db
				.select()
				.from(orderShipping)
				.where(eq(orderShipping.orderId, orderId))
				.limit(1);
			return { amount: shippingRecord?.price ?? 0, type: "shipping" };
		}

		if (promo.promotionType === "product") {
			const qualifyingTotal = await this.qualifyingLineTotal(orderId, promo.id);
			return { amount: calculateDiscount(promo, qualifyingTotal), type: "product" };
		}

		return { amount: calculateDiscount(promo, subtotal), type: "order" };
	}

	/** Sum of line totals for the products a product-scoped promotion applies to. */
	private async qualifyingLineTotal(orderId: number, promotionId: number): Promise<number> {
		const qualifyingProductIds = await promotionService.getQualifyingProductIds(promotionId);

		const linesWithProducts = await db
			.select({
				lineTotal: orderLines.lineTotal,
				productId: products.id
			})
			.from(orderLines)
			.innerJoin(productVariants, eq(orderLines.variantId, productVariants.id))
			.innerJoin(products, eq(productVariants.productId, products.id))
			.where(eq(orderLines.orderId, orderId));

		return linesWithProducts
			.filter(
				(l) => qualifyingProductIds === null || qualifyingProductIds.includes(l.productId)
			)
			.reduce((sum, l) => sum + l.lineTotal, 0);
	}

	private async deleteOrderPromotion(orderId: number, promotionId: number): Promise<void> {
		await db
			.delete(orderPromotions)
			.where(
				and(
					eq(orderPromotions.orderId, orderId),
					eq(orderPromotions.promotionId, promotionId)
				)
			);
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

	private async recalculateTotals(orderId: number): Promise<void> {
		await this.applyAutomaticPromotions(orderId);

		// Get all lines
		const lines = await db.select().from(orderLines).where(eq(orderLines.orderId, orderId));

		const subtotal = lines.reduce((sum, line) => sum + line.lineTotal, 0);

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

			const { amount: newAmount } = await this.computePromotionDiscount(
				promo,
				orderId,
				subtotal
			);

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

		// Get shipping cost from order_shipping table
		const [shippingRecord] = await db
			.select()
			.from(orderShipping)
			.where(eq(orderShipping.orderId, orderId))
			.limit(1);
		const rawShipping = shippingRecord?.price ?? 0;

		// A shipping promotion means free shipping: keep its discount amount in
		// sync with the (possibly changed) shipping method, in the DB and in the
		// local rows the totals are computed from.
		for (const sp of appliedPromotions) {
			if (sp.type !== "shipping") continue;
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
				sp.discountAmount = rawShipping;
			}
		}

		// Get order to check tax exemption status
		const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
		const isTaxExempt = order ? await taxService.isCustomerTaxExempt(order.customerId) : false;

		const totals = calculateOrderTotals({
			lines,
			appliedPromotions,
			shipping: rawShipping,
			isTaxExempt
		});

		// The revision only moves when the money actually moves. Payment
		// providers key their idempotency on it, so bumping it needlessly would
		// hand out a new intent on every recalculation.
		const moneyChanged =
			!order ||
			order.subtotal !== totals.subtotal ||
			order.discount !== totals.discount ||
			order.shipping !== totals.shipping ||
			order.total !== totals.total;

		await db
			.update(orders)
			.set({
				subtotal: totals.subtotal,
				discount: totals.discount,
				shipping: totals.shipping,
				total: totals.total,
				taxTotal: totals.taxTotal,
				totalNet: totals.totalNet,
				isTaxExempt,
				...(moneyChanged ? { paymentRevision: sql`${orders.paymentRevision} + 1` } : {})
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
