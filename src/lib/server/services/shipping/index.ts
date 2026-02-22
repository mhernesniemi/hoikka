/**
 * Shipping Service
 * Manages shipping methods and order shipping information
 */
import { eq, and, inArray } from "drizzle-orm";
import { db } from "../../db/index.js";
import { shippingMethods, orderShipping } from "../../db/schema.js";
import type {
	ShippingMethod,
	NewShippingMethod,
	OrderShipping,
	NewOrderShipping,
	OrderWithRelations
} from "$lib/types.js";
import type { ShippingProvider, ShippingRate, ShipmentInfo } from "./types.js";
import { FlatRateProvider } from "./providers/index.js";

// Provider registry - maps provider codes to provider instances
const PROVIDERS = new Map<string, ShippingProvider>([["flat_rate", new FlatRateProvider()]]);

export class ShippingService {
	/**
	 * Get all active shipping methods
	 */
	async getActiveMethods(): Promise<ShippingMethod[]> {
		return db.select().from(shippingMethods).where(eq(shippingMethods.active, true));
	}

	/**
	 * Get shipping method by code
	 */
	async getMethodByCode(code: string): Promise<ShippingMethod | null> {
		const [method] = await db
			.select()
			.from(shippingMethods)
			.where(eq(shippingMethods.code, code))
			.limit(1);

		return method ?? null;
	}

	/**
	 * Get shipping method by ID
	 */
	async getMethodById(id: number): Promise<ShippingMethod | null> {
		const [method] = await db
			.select()
			.from(shippingMethods)
			.where(eq(shippingMethods.id, id))
			.limit(1);

		return method ?? null;
	}

	/**
	 * Get available shipping rates for an order
	 * Aggregates rates from all active providers
	 */
	async getAvailableRates(order: OrderWithRelations): Promise<ShippingRate[]> {
		const activeMethods = await this.getActiveMethods();
		const allRates: ShippingRate[] = [];

		for (const method of activeMethods) {
			const provider = PROVIDERS.get(method.code);
			if (provider) {
				try {
					const rates = await provider.getRates(order);
					// Add method ID to each rate for reference
					const ratesWithMethodId = rates.map((rate) => ({
						...rate,
						methodId: method.id,
						methodCode: method.code
					}));
					allRates.push(...ratesWithMethodId);
				} catch (error) {
					console.error(`Error getting rates from provider ${method.code}:`, error);
					// Continue with other providers even if one fails
				}
			}
		}

		return allRates;
	}

	/**
	 * Set shipping method for an order
	 */
	async setShippingMethod(
		orderId: number,
		shippingMethodId: number,
		rateId: string,
		price: number
	): Promise<OrderShipping> {
		// Check if shipping already exists for this order
		const [existing] = await db
			.select()
			.from(orderShipping)
			.where(eq(orderShipping.orderId, orderId))
			.limit(1);

		if (existing) {
			// Update existing shipping
			const [updated] = await db
				.update(orderShipping)
				.set({
					shippingMethodId,
					price,
					status: "pending"
				})
				.where(eq(orderShipping.id, existing.id))
				.returning();

			return updated;
		}

		// Create new shipping record
		const [newShipping] = await db
			.insert(orderShipping)
			.values({
				orderId,
				shippingMethodId,
				price,
				status: "pending"
			})
			.returning();

		return newShipping;
	}

	/**
	 * Get shipping info for an order
	 */
	async getOrderShipping(orderId: number): Promise<OrderShipping | null> {
		const [shipping] = await db
			.select()
			.from(orderShipping)
			.where(eq(orderShipping.orderId, orderId))
			.limit(1);

		return shipping ?? null;
	}

	/**
	 * Create shipment for an order (after payment)
	 * Calls the provider's createShipment method
	 */
	async createShipment(order: OrderWithRelations): Promise<ShipmentInfo> {
		const shipping = await this.getOrderShipping(order.id);
		if (!shipping) {
			throw new Error("No shipping method set for this order");
		}

		const method = await this.getMethodById(shipping.shippingMethodId);
		if (!method) {
			throw new Error("Shipping method not found");
		}

		const provider = PROVIDERS.get(method.code);
		if (!provider) {
			throw new Error(`Provider not found for method ${method.code}`);
		}

		// Create shipment via provider
		const shipmentInfo = await provider.createShipment(order);

		// Update order shipping with tracking info
		await db
			.update(orderShipping)
			.set({
				trackingNumber: shipmentInfo.trackingNumber,
				metadata: shipmentInfo.metadata ?? null,
				status: "shipped"
			})
			.where(eq(orderShipping.id, shipping.id));

		return shipmentInfo;
	}

	/**
	 * Track shipment
	 */
	async trackShipment(orderId: number): Promise<string | null> {
		const shipping = await this.getOrderShipping(orderId);
		if (!shipping || !shipping.trackingNumber) {
			return null;
		}

		const method = await this.getMethodById(shipping.shippingMethodId);
		if (!method) {
			return null;
		}

		const provider = PROVIDERS.get(method.code);
		if (!provider || !provider.trackShipment) {
			return null;
		}

		try {
			const status = await provider.trackShipment(shipping.trackingNumber);

			// Update status in database
			await db
				.update(orderShipping)
				.set({
					status
				})
				.where(eq(orderShipping.id, shipping.id));

			return status;
		} catch (error) {
			console.error("Error tracking shipment:", error);
			return null;
		}
	}

	/**
	 * Update shipping status manually
	 */
	async updateShippingStatus(
		orderId: number,
		status: "pending" | "shipped" | "in_transit" | "delivered"
	): Promise<OrderShipping> {
		const [updated] = await db
			.update(orderShipping)
			.set({
				status
			})
			.where(eq(orderShipping.orderId, orderId))
			.returning();

		if (!updated) {
			throw new Error("Shipping not found for this order");
		}

		return updated;
	}

	/**
	 * Register a new shipping provider
	 * Useful for adding custom providers
	 */
	registerProvider(provider: ShippingProvider): void {
		PROVIDERS.set(provider.code, provider);
	}

	/**
	 * Initialize default shipping methods in database
	 * Call this during setup/migration
	 * Optimized to use a single query instead of multiple queries
	 */
	async initializeDefaultMethods(): Promise<void> {
		const defaultMethods: NewShippingMethod[] = [
			{
				code: "flat_rate",
				name: "Standard Shipping",
				description: "Flat rate standard delivery",
				active: true
			}
		];

		// Fetch all existing methods in one query
		const codes = defaultMethods.map((m) => m.code);
		const existing = await db
			.select()
			.from(shippingMethods)
			.where(inArray(shippingMethods.code, codes));

		const existingCodes = new Set(existing.map((m) => m.code));

		// Insert only missing methods
		const toInsert = defaultMethods.filter((m) => !existingCodes.has(m.code));
		if (toInsert.length > 0) {
			await db.insert(shippingMethods).values(toInsert);
		}
	}
}

// Export singleton instance
export const shippingService = new ShippingService();
