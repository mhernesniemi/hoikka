/**
 * Digital Delivery Service
 * Sends email containing product content after payment for digital products
 */
import { Resend } from "resend";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import {
	orders,
	orderLines,
	productVariants,
	products,
	productTranslations
} from "../db/schema.js";
import { env } from "$env/dynamic/private";

export class DigitalDeliveryService {
	private resend: Resend | null = null;
	private fromEmail: string = "noreply@example.com";

	private getResend(): Resend | null {
		if (!this.resend) {
			if (!env.RESEND_API_KEY) {
				return null;
			}
			this.resend = new Resend(env.RESEND_API_KEY);
			this.fromEmail = env.RESEND_FROM_EMAIL || "noreply@example.com";
		}
		return this.resend;
	}

	/**
	 * Deliver all digital products for an order
	 */
	async deliverOrder(orderId: number): Promise<{ sent: number; errors: string[] }> {
		const resend = this.getResend();
		if (!resend) {
			console.error("[digital-delivery] RESEND_API_KEY is not set — skipping email delivery");
			return { sent: 0, errors: ["Email delivery is not configured"] };
		}

		const errors: string[] = [];
		let sent = 0;

		// Load order
		const [order] = await db.select().from(orders).where(eq(orders.id, orderId));

		if (!order) {
			return { sent: 0, errors: ["Order not found"] };
		}

		// Load order lines with variants and products
		const lines = await db
			.select({
				line: orderLines,
				variant: productVariants,
				product: products
			})
			.from(orderLines)
			.innerJoin(productVariants, eq(orderLines.variantId, productVariants.id))
			.innerJoin(products, eq(productVariants.productId, products.id))
			.where(eq(orderLines.orderId, orderId));

		// Check if order has any digital products
		const digitalProducts = lines.filter(({ product }) => product.type === "digital");
		if (digitalProducts.length === 0) {
			return { sent: 0, errors: [] };
		}

		// Only require email if there are digital products to deliver
		if (!order.customerEmail) {
			return { sent: 0, errors: [`No customer email on order ${orderId}`] };
		}

		// Process each digital product
		for (const { product } of lines) {
			if (product.type !== "digital") continue;

			// Load product name
			const [productTranslation] = await db
				.select()
				.from(productTranslations)
				.where(eq(productTranslations.productId, product.id));

			const productName = productTranslation?.name ?? `Product #${product.id}`;

			// Send email
			try {
				await resend.emails.send({
					from: this.fromEmail,
					to: order.customerEmail,
					subject: `Your order ${order.code} - ${productName}`,
					html: this.buildEmailContent({
						customerName: order.shippingFullName || "Customer",
						productName,
						orderCode: order.code
					})
				});
				sent++;
			} catch (err) {
				errors.push(
					`Failed to send email for product ${product.id}: ${err instanceof Error ? err.message : "Unknown error"}`
				);
			}
		}

		return { sent, errors };
	}

	/**
	 * Build email content for digital product delivery
	 */
	private buildEmailContent(data: {
		customerName: string;
		productName: string;
		orderCode: string;
	}): string {
		return `
			<p>Hi ${data.customerName},</p>
			<p>Thank you for your order!</p>
			<p><strong>Your product:</strong> ${data.productName}<br>
			<strong>Order ID:</strong> ${data.orderCode}</p>
			<p>Enjoy!</p>
		`.trim();
	}
}

// Export singleton instance
export const digitalDeliveryService = new DigitalDeliveryService();
