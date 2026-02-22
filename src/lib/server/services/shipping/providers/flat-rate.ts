/**
 * Flat Rate Shipping Provider
 * Simple flat-rate shipping for demo/development use
 */
import type { ShippingProvider, ShippingRate, ShipmentInfo, ShipmentStatus } from "../types.js";
import type { OrderWithRelations } from "$lib/types.js";
import { generateTrackingNumber } from "../shipping-utils.js";

export class FlatRateProvider implements ShippingProvider {
	code = "flat_rate";

	async getRates(_order: OrderWithRelations): Promise<ShippingRate[]> {
		return [
			{
				id: "flat_rate",
				name: "Standard Shipping",
				price: 590,
				estimatedDeliveryDays: 5,
				description: "Standard delivery"
			}
		];
	}

	async createShipment(order: OrderWithRelations): Promise<ShipmentInfo> {
		const trackingNumber = generateTrackingNumber("flat", order.id);
		return {
			trackingNumber,
			metadata: {
				provider: "flat_rate",
				createdAt: new Date().toISOString()
			}
		};
	}

	async trackShipment(_trackingNumber: string): Promise<ShipmentStatus> {
		return "in_transit";
	}
}
