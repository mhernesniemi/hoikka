/**
 * Shipping Provider Interface and Types
 * Defines the contract for shipping providers (flat rate, UPS, etc.)
 */
import type { OrderWithRelations } from "@hoikka/core/shared/types";

export interface ShippingProvider {
	code: string; // unique code like 'flat_rate'

	getRates: (order: OrderWithRelations) => Promise<ShippingRate[]>;
	createShipment: (order: OrderWithRelations) => Promise<ShipmentInfo>;
	trackShipment?: (trackingNumber: string) => Promise<ShipmentStatus>;
}

export type ShippingRate = {
	id: string;
	name: string;
	price: number; // Price in cents
	estimatedDeliveryDays?: number;
	description?: string;
	methodId?: number; // Shipping method ID (added by service)
	methodCode?: string; // Shipping method code (added by service)
};

export type ShipmentInfo = {
	trackingNumber: string;
	labelUrl?: string;
	metadata?: Record<string, unknown>;
};

// Shipment status values must match the database orderShipping.status enum
export type ShipmentStatus = "pending" | "shipped" | "in_transit" | "delivered" | "error";

export interface ShippingAddress {
	fullName: string;
	streetLine1: string;
	streetLine2?: string;
	city: string;
	postalCode: string;
	country: string;
	phoneNumber?: string;
}
