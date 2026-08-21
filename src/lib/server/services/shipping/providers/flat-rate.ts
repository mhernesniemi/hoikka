/**
 * Flat Rate Shipping Provider
 * Simple flat-rate shipping for demo/development use
 */
import type { ShippingProvider, ShippingRate, ShipmentInfo, ShipmentStatus } from "../types.js";
import type { OrderWithRelations } from "$lib/types.js";
import { generateTrackingNumber } from "../shipping-utils.js";

export class FlatRateProvider implements ShippingProvider {
	code = "flat_rate";

	constructor(
		private options: {
			amount?: number;
			label?: string;
			estimatedDeliveryDays?: number;
			description?: string;
		} = {}
	) {}

	async getRates(_order: OrderWithRelations): Promise<ShippingRate[]> {
		return [
			{
				id: "flat_rate",
				name: this.options.label ?? "Standard Shipping",
				price: this.options.amount ?? 590,
				estimatedDeliveryDays: this.options.estimatedDeliveryDays ?? 5,
				description: this.options.description ?? "Standard delivery"
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
