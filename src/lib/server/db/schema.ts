/**
 * Drizzle Schema for Hoikka
 */
import { relations } from "drizzle-orm";
import {
	pgTable,
	serial,
	text,
	boolean,
	integer,
	timestamp,
	varchar,
	primaryKey,
	index,
	uniqueIndex,
	numeric,
	jsonb,
	customType
} from "drizzle-orm/pg-core";

const tsvector = customType<{ data: string }>({
	dataType() {
		return "tsvector";
	}
});

// ============================================================================
// TAX RATES
// ============================================================================

export const taxRates = pgTable("tax_rates", {
	code: varchar("code", { length: 20 }).primaryKey(),
	rate: numeric("rate", { precision: 5, scale: 4 }).notNull(), // 0.24 for 24%
	name: varchar("name", { length: 100 }).notNull(),
	createdAt: timestamp("created_at").defaultNow().notNull()
});

// ============================================================================
// PRODUCTS
// ============================================================================

export const products = pgTable(
	"products",
	{
		id: serial("id").primaryKey(),
		name: varchar("name", { length: 255 }).default("").notNull(),
		slug: varchar("slug", { length: 255 }).default("").notNull(),
		description: text("description"),
		type: text("type", {
			enum: ["physical", "digital"]
		})
			.default("physical")
			.notNull(),
		visibility: text("visibility", {
			enum: ["public", "private", "draft"]
		})
			.default("public")
			.notNull(),
		taxCode: varchar("tax_code", { length: 20 }).default("standard").notNull(),
		featuredAssetId: integer("featured_asset_id"),
		deletedAt: timestamp("deleted_at"),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull()
	},
	(table) => [
		index("products_visibility_idx").on(table.visibility),
		index("products_created_at_idx").on(table.createdAt)
	]
);

export const productTranslations = pgTable(
	"product_translations",
	{
		id: serial("id").primaryKey(),
		productId: integer("product_id")
			.references(() => products.id, { onDelete: "cascade" })
			.notNull(),
		languageCode: varchar("language_code", { length: 10 }).notNull(),
		name: varchar("name", { length: 255 }).notNull(),
		slug: varchar("slug", { length: 255 }).notNull(),
		description: text("description")
	},
	(table) => [
		uniqueIndex("product_translations_product_lang_idx").on(
			table.productId,
			table.languageCode
		),
		index("product_translations_slug_idx").on(table.slug)
	]
);

// ============================================================================
// PRODUCT VARIANTS
// ============================================================================

export const productVariants = pgTable(
	"product_variants",
	{
		id: serial("id").primaryKey(),
		productId: integer("product_id")
			.references(() => products.id, { onDelete: "cascade" })
			.notNull(),
		name: varchar("name", { length: 255 }),
		sku: varchar("sku", { length: 255 }).notNull(),
		price: integer("price").notNull(), // Price in cents
		stock: integer("stock").default(0).notNull(),
		trackInventory: boolean("track_inventory").default(true).notNull(),
		featuredAssetId: integer("featured_asset_id"),
		imageUrl: varchar("image_url", { length: 500 }),
		isFeatured: boolean("is_featured").default(false).notNull(),
		deletedAt: timestamp("deleted_at"),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull()
	},
	(table) => [
		uniqueIndex("product_variants_sku_idx").on(table.sku),
		index("product_variants_product_idx").on(table.productId)
	]
);

export const productVariantTranslations = pgTable(
	"product_variant_translations",
	{
		id: serial("id").primaryKey(),
		variantId: integer("variant_id")
			.references(() => productVariants.id, { onDelete: "cascade" })
			.notNull(),
		languageCode: varchar("language_code", { length: 10 }).notNull(),
		name: varchar("name", { length: 255 })
	},
	(table) => [
		uniqueIndex("product_variant_translations_variant_lang_idx").on(
			table.variantId,
			table.languageCode
		)
	]
);

// B2B Group Pricing - groupId references customerGroups (defined later in file)
export const productVariantGroupPrices = pgTable(
	"product_variant_group_prices",
	{
		id: serial("id").primaryKey(),
		variantId: integer("variant_id")
			.references(() => productVariants.id, { onDelete: "cascade" })
			.notNull(),
		groupId: integer("group_id").notNull(),
		price: integer("price").notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull()
	},
	(table) => [
		uniqueIndex("variant_group_price_unique").on(table.variantId, table.groupId),
		index("variant_group_prices_variant_idx").on(table.variantId),
		index("variant_group_prices_group_idx").on(table.groupId)
	]
);

// ============================================================================
// FACETS & FACET VALUES
// ============================================================================

export const facets = pgTable("facets", {
	id: serial("id").primaryKey(),
	name: varchar("name", { length: 255 }).default("").notNull(),
	code: varchar("code", { length: 255 }).notNull().unique(),
	isHidden: boolean("is_hidden").default(false).notNull(),
	createdAt: timestamp("created_at").defaultNow().notNull(),
	updatedAt: timestamp("updated_at")
		.defaultNow()
		.$onUpdate(() => new Date())
		.notNull()
});

export const facetTranslations = pgTable(
	"facet_translations",
	{
		id: serial("id").primaryKey(),
		facetId: integer("facet_id")
			.references(() => facets.id, { onDelete: "cascade" })
			.notNull(),
		languageCode: varchar("language_code", { length: 10 }).notNull(),
		name: varchar("name", { length: 255 }).notNull()
	},
	(table) => [
		uniqueIndex("facet_translations_facet_lang_idx").on(table.facetId, table.languageCode)
	]
);

export const facetValues = pgTable(
	"facet_values",
	{
		id: serial("id").primaryKey(),
		facetId: integer("facet_id")
			.references(() => facets.id, { onDelete: "cascade" })
			.notNull(),
		name: varchar("name", { length: 255 }).default("").notNull(),
		code: varchar("code", { length: 255 }).notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull()
	},
	(table) => [
		uniqueIndex("facet_values_facet_code_idx").on(table.facetId, table.code),
		index("facet_values_facet_idx").on(table.facetId)
	]
);

export const facetValueTranslations = pgTable(
	"facet_value_translations",
	{
		id: serial("id").primaryKey(),
		facetValueId: integer("facet_value_id")
			.references(() => facetValues.id, { onDelete: "cascade" })
			.notNull(),
		languageCode: varchar("language_code", { length: 10 }).notNull(),
		name: varchar("name", { length: 255 }).notNull()
	},
	(table) => [
		uniqueIndex("facet_value_translations_value_lang_idx").on(
			table.facetValueId,
			table.languageCode
		)
	]
);

// Product-FacetValue many-to-many join
export const productFacetValues = pgTable(
	"product_facet_values",
	{
		productId: integer("product_id")
			.references(() => products.id, { onDelete: "cascade" })
			.notNull(),
		facetValueId: integer("facet_value_id")
			.references(() => facetValues.id, { onDelete: "cascade" })
			.notNull()
	},
	(table) => [
		primaryKey({ columns: [table.productId, table.facetValueId] }),
		index("product_facet_values_product_idx").on(table.productId),
		index("product_facet_values_value_idx").on(table.facetValueId)
	]
);

// Variant-FacetValue many-to-many join (for variant-specific facets like size/color)
export const variantFacetValues = pgTable(
	"variant_facet_values",
	{
		variantId: integer("variant_id")
			.references(() => productVariants.id, { onDelete: "cascade" })
			.notNull(),
		facetValueId: integer("facet_value_id")
			.references(() => facetValues.id, { onDelete: "cascade" })
			.notNull()
	},
	(table) => [
		primaryKey({ columns: [table.variantId, table.facetValueId] }),
		index("variant_facet_values_variant_idx").on(table.variantId),
		index("variant_facet_values_value_idx").on(table.facetValueId)
	]
);

// ============================================================================
// ASSETS
// ============================================================================

export const assets = pgTable("assets", {
	id: serial("id").primaryKey(),
	name: varchar("name", { length: 255 }).notNull(),
	type: text("type", { enum: ["image", "video", "document", "other"] }).notNull(),
	mimeType: varchar("mime_type", { length: 100 }).notNull(),
	width: integer("width").default(0),
	height: integer("height").default(0),
	fileSize: integer("file_size").default(0),
	source: varchar("source", { length: 500 }).notNull(), // Vercel Blob URL
	alt: text("alt"), // Alt text for accessibility
	focalX: numeric("focal_x", { precision: 4, scale: 3 }).default("0.5").notNull(), // 0–1 horizontal focal point
	focalY: numeric("focal_y", { precision: 4, scale: 3 }).default("0.5").notNull(), // 0–1 vertical focal point
	createdAt: timestamp("created_at").defaultNow().notNull()
});

export const assetTranslations = pgTable(
	"asset_translations",
	{
		id: serial("id").primaryKey(),
		assetId: integer("asset_id")
			.references(() => assets.id, { onDelete: "cascade" })
			.notNull(),
		languageCode: varchar("language_code", { length: 10 }).notNull(),
		alt: text("alt")
	},
	(table) => [
		uniqueIndex("asset_translations_asset_lang_idx").on(table.assetId, table.languageCode)
	]
);

export const productAssets = pgTable(
	"product_assets",
	{
		productId: integer("product_id")
			.references(() => products.id, { onDelete: "cascade" })
			.notNull(),
		assetId: integer("asset_id")
			.references(() => assets.id, { onDelete: "cascade" })
			.notNull(),
		position: integer("position").default(0).notNull()
	},
	(table) => [
		primaryKey({ columns: [table.productId, table.assetId] }),
		index("product_assets_product_idx").on(table.productId)
	]
);

export const productVariantAssets = pgTable(
	"product_variant_assets",
	{
		variantId: integer("variant_id")
			.references(() => productVariants.id, { onDelete: "cascade" })
			.notNull(),
		assetId: integer("asset_id")
			.references(() => assets.id, { onDelete: "cascade" })
			.notNull(),
		position: integer("position").default(0).notNull()
	},
	(table) => [
		primaryKey({ columns: [table.variantId, table.assetId] }),
		index("product_variant_assets_variant_idx").on(table.variantId)
	]
);

// ============================================================================
// CUSTOMER GROUPS (B2B)
// ============================================================================

export const customerGroups = pgTable(
	"customer_groups",
	{
		id: serial("id").primaryKey(),
		code: varchar("code", { length: 100 }).notNull().unique(),
		name: varchar("name", { length: 255 }).notNull(),
		description: text("description"),
		isTaxExempt: boolean("is_tax_exempt").default(false).notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull()
	},
	(table) => [uniqueIndex("customer_groups_code_idx").on(table.code)]
);

// Customer-Group many-to-many join
export const customerGroupMembers = pgTable(
	"customer_group_members",
	{
		customerId: integer("customer_id")
			.references(() => customers.id, { onDelete: "cascade" })
			.notNull(),
		groupId: integer("group_id")
			.references(() => customerGroups.id, { onDelete: "cascade" })
			.notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull()
	},
	(table) => [
		primaryKey({ columns: [table.customerId, table.groupId] }),
		index("customer_group_members_customer_idx").on(table.customerId),
		index("customer_group_members_group_idx").on(table.groupId)
	]
);

// ============================================================================
// CUSTOMERS
// ============================================================================

export const customers = pgTable(
	"customers",
	{
		id: serial("id").primaryKey(),
		authUserId: varchar("auth_user_id", { length: 255 }).unique(),
		email: varchar("email", { length: 255 }).notNull(),
		firstName: varchar("first_name", { length: 100 }).notNull(),
		lastName: varchar("last_name", { length: 100 }).notNull(),
		phone: varchar("phone", { length: 50 }),
		vatId: varchar("vat_id", { length: 50 }), // B2B VAT ID for tax exemption
		deletedAt: timestamp("deleted_at"),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull()
	},
	(table) => [
		uniqueIndex("customers_email_idx").on(table.email),
		uniqueIndex("customers_auth_user_id_idx").on(table.authUserId),
		index("customers_name_idx").on(table.firstName, table.lastName)
	]
);

export const addresses = pgTable(
	"addresses",
	{
		id: serial("id").primaryKey(),
		customerId: integer("customer_id")
			.references(() => customers.id, { onDelete: "cascade" })
			.notNull(),
		fullName: varchar("full_name", { length: 255 }),
		company: varchar("company", { length: 255 }),
		streetLine1: varchar("street_line_1", { length: 255 }).notNull(),
		streetLine2: varchar("street_line_2", { length: 255 }),
		city: varchar("city", { length: 100 }).notNull(),
		postalCode: varchar("postal_code", { length: 20 }).notNull(),
		country: varchar("country", { length: 100 }).notNull(),
		phoneNumber: varchar("phone_number", { length: 50 }),
		isDefault: boolean("is_default").default(false).notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull()
	},
	(table) => [index("addresses_customer_idx").on(table.customerId)]
);

// ============================================================================
// ORDERS
// ============================================================================

export const orders = pgTable(
	"orders",
	{
		id: serial("id").primaryKey(),
		code: varchar("code", { length: 50 }).notNull().unique(), // Customer-facing order reference
		customerId: integer("customer_id").references(() => customers.id, { onDelete: "set null" }),
		cartToken: varchar("cart_token", { length: 64 }).unique(), // For guest cart tracking via cookies
		active: boolean("active").default(true).notNull(), // true = cart, false = completed order
		state: text("state", {
			enum: ["created", "payment_pending", "paid", "shipped", "delivered", "cancelled"]
		})
			.notNull()
			.default("created"),
		// Pricing (all in cents)
		subtotal: integer("subtotal").default(0).notNull(),
		shipping: integer("shipping").default(0).notNull(),
		discount: integer("discount").default(0).notNull(),
		total: integer("total").default(0).notNull(),
		// Tax fields
		taxTotal: integer("tax_total").default(0).notNull(),
		totalNet: integer("total_net").default(0).notNull(), // total minus tax
		isTaxExempt: boolean("is_tax_exempt").default(false).notNull(),
		currencyCode: varchar("currency_code", { length: 3 }).default("EUR").notNull(),
		exchangeRate: numeric("exchange_rate", { precision: 10, scale: 6 }).default("1").notNull(), // Rate from base currency (EUR) at order time
		// Shipping address snapshot
		shippingFullName: varchar("shipping_full_name", { length: 255 }),
		shippingStreetLine1: varchar("shipping_street_line_1", { length: 255 }),
		shippingStreetLine2: varchar("shipping_street_line_2", { length: 255 }),
		shippingCity: varchar("shipping_city", { length: 100 }),
		shippingPostalCode: varchar("shipping_postal_code", { length: 20 }),
		shippingCountry: varchar("shipping_country", { length: 100 }),
		// Contact email (for order confirmations and digital delivery)
		customerEmail: varchar("customer_email", { length: 255 }),
		// Timestamps
		orderPlacedAt: timestamp("order_placed_at"),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull()
	},
	(table) => [
		index("orders_customer_idx").on(table.customerId),
		index("orders_state_idx").on(table.state),
		index("orders_placed_at_idx").on(table.orderPlacedAt),
		index("orders_active_idx").on(table.active),
		index("orders_cart_token_idx").on(table.cartToken)
	]
);

export const orderLines = pgTable(
	"order_lines",
	{
		id: serial("id").primaryKey(),
		orderId: integer("order_id")
			.references(() => orders.id, { onDelete: "cascade" })
			.notNull(),
		variantId: integer("variant_id")
			.references(() => productVariants.id)
			.notNull(),
		quantity: integer("quantity").notNull(),
		// Price snapshot at time of order (in cents) - unitPrice and lineTotal are gross (VAT-inclusive)
		unitPrice: integer("unit_price").notNull(),
		lineTotal: integer("line_total").notNull(),
		// Tax fields
		taxCode: varchar("tax_code", { length: 20 }).default("standard").notNull(),
		taxRate: numeric("tax_rate", { precision: 5, scale: 4 }).default("0.24").notNull(), // 0.24 for 24%
		taxAmount: integer("tax_amount").default(0).notNull(),
		unitPriceNet: integer("unit_price_net").default(0).notNull(),
		lineTotalNet: integer("line_total_net").default(0).notNull(),
		// Product info snapshot
		productName: varchar("product_name", { length: 255 }).notNull(),
		variantName: varchar("variant_name", { length: 255 }),
		sku: varchar("sku", { length: 255 }).notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull()
	},
	(table) => [
		index("order_lines_order_idx").on(table.orderId),
		index("order_lines_variant_idx").on(table.variantId)
	]
);

// ============================================================================
// STOCK RESERVATIONS
// ============================================================================

export const stockReservations = pgTable(
	"stock_reservations",
	{
		id: serial("id").primaryKey(),
		variantId: integer("variant_id")
			.references(() => productVariants.id, { onDelete: "cascade" })
			.notNull(),
		orderId: integer("order_id")
			.references(() => orders.id, { onDelete: "cascade" })
			.notNull(),
		orderLineId: integer("order_line_id")
			.references(() => orderLines.id, { onDelete: "cascade" })
			.notNull(),
		quantity: integer("quantity").notNull(),
		expiresAt: timestamp("expires_at").notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull()
	},
	(table) => [
		index("stock_reservations_variant_idx").on(table.variantId),
		index("stock_reservations_expires_idx").on(table.expiresAt),
		index("stock_reservations_order_idx").on(table.orderId),
		index("stock_reservations_line_idx").on(table.orderLineId)
	]
);

// ============================================================================
// PAYMENTS
// ============================================================================

export const paymentMethods = pgTable(
	"payment_methods",
	{
		id: serial("id").primaryKey(),
		code: varchar("code", { length: 100 }).notNull().unique(), // 'stripe', 'paypal', 'klarna'
		name: varchar("name", { length: 255 }).notNull(), // 'Stripe', 'PayPal', 'Klarna'
		description: text("description"),
		active: boolean("active").default(true).notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull()
	},
	(table) => [
		uniqueIndex("payment_methods_code_idx").on(table.code),
		index("payment_methods_active_idx").on(table.active)
	]
);

export const payments = pgTable(
	"payments",
	{
		id: serial("id").primaryKey(),
		orderId: integer("order_id")
			.references(() => orders.id, { onDelete: "cascade" })
			.notNull(),
		paymentMethodId: integer("payment_method_id")
			.references(() => paymentMethods.id)
			.notNull(),
		method: varchar("method", { length: 100 }).notNull(), // Legacy: kept for backward compatibility
		amount: integer("amount").notNull(), // Amount in cents
		state: text("state", { enum: ["pending", "authorized", "settled", "declined", "refunded"] })
			.notNull()
			.default("pending"),
		transactionId: varchar("transaction_id", { length: 255 }), // External gateway ID
		errorMessage: text("error_message"),
		metadata: jsonb("metadata"), // Store provider-specific data (changed from text to jsonb)
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull()
	},
	(table) => [
		index("payments_order_idx").on(table.orderId),
		index("payments_method_idx").on(table.paymentMethodId),
		index("payments_state_idx").on(table.state),
		index("payments_transaction_idx").on(table.transactionId)
	]
);

// ============================================================================
// SHIPPING
// ============================================================================

export const shippingMethods = pgTable(
	"shipping_methods",
	{
		id: serial("id").primaryKey(),
		code: varchar("code", { length: 100 }).notNull().unique(), // 'flat_rate', 'ups_ground'
		name: varchar("name", { length: 255 }).notNull(), // 'Standard Shipping', 'UPS Ground'
		description: text("description"),
		active: boolean("active").default(true).notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull()
	},
	(table) => [
		uniqueIndex("shipping_methods_code_idx").on(table.code),
		index("shipping_methods_active_idx").on(table.active)
	]
);

export const orderShipping = pgTable(
	"order_shipping",
	{
		id: serial("id").primaryKey(),
		orderId: integer("order_id")
			.references(() => orders.id, { onDelete: "cascade" })
			.notNull(),
		shippingMethodId: integer("shipping_method_id")
			.references(() => shippingMethods.id)
			.notNull(),
		trackingNumber: varchar("tracking_number", { length: 255 }),
		status: text("status", { enum: ["pending", "shipped", "in_transit", "delivered", "error"] })
			.default("pending")
			.notNull(),
		price: integer("price").notNull(), // Price in cents
		metadata: jsonb("metadata"), // Store provider-specific data
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull()
	},
	(table) => [
		index("order_shipping_order_idx").on(table.orderId),
		index("order_shipping_method_idx").on(table.shippingMethodId),
		index("order_shipping_status_idx").on(table.status),
		index("order_shipping_tracking_idx").on(table.trackingNumber)
	]
);

// ============================================================================
// PROMOTIONS
// ============================================================================

export const promotions = pgTable(
	"promotions",
	{
		id: serial("id").primaryKey(),
		method: text("method", { enum: ["code", "automatic"] })
			.default("code")
			.notNull(),
		code: varchar("code", { length: 50 }).unique(),
		title: varchar("title", { length: 255 }),
		promotionType: text("promotion_type", { enum: ["order", "product", "free_shipping"] })
			.default("order")
			.notNull(),
		discountType: text("discount_type", { enum: ["percentage", "fixed_amount"] }).notNull(),
		discountValue: integer("discount_value").notNull(), // Percentage (0-100) or amount in cents
		appliesTo: text("applies_to", {
			enum: ["all", "specific_products", "specific_collections"]
		})
			.default("all")
			.notNull(),
		minOrderAmount: integer("min_order_amount"), // Minimum order amount for promotion
		usageLimit: integer("usage_limit"), // Max number of times this can be used
		usageCount: integer("usage_count").default(0).notNull(),
		usageLimitPerCustomer: integer("usage_limit_per_customer"),
		combinesWithOtherPromotions: boolean("combines_with_other_promotions")
			.default(false)
			.notNull(),
		enabled: boolean("enabled").default(true).notNull(),
		customerGroupId: integer("customer_group_id").references(() => customerGroups.id, {
			onDelete: "set null"
		}),
		startsAt: timestamp("starts_at"),
		endsAt: timestamp("ends_at"),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull()
	},
	(table) => [
		index("promotions_code_idx").on(table.code),
		index("promotions_enabled_idx").on(table.enabled)
	]
);

// Promotion-Product junction table (for product-specific promotions)
export const promotionProducts = pgTable(
	"promotion_products",
	{
		promotionId: integer("promotion_id")
			.references(() => promotions.id, { onDelete: "cascade" })
			.notNull(),
		productId: integer("product_id")
			.references(() => products.id, { onDelete: "cascade" })
			.notNull()
	},
	(table) => [primaryKey({ columns: [table.promotionId, table.productId] })]
);

// Promotion-Collection junction table (for collection-specific promotions)
export const promotionCollections = pgTable(
	"promotion_collections",
	{
		promotionId: integer("promotion_id")
			.references(() => promotions.id, { onDelete: "cascade" })
			.notNull(),
		collectionId: integer("collection_id")
			.references(() => collections.id, { onDelete: "cascade" })
			.notNull()
	},
	(table) => [primaryKey({ columns: [table.promotionId, table.collectionId] })]
);

// Applied promotions to orders
export const orderPromotions = pgTable(
	"order_promotions",
	{
		orderId: integer("order_id")
			.references(() => orders.id, { onDelete: "cascade" })
			.notNull(),
		promotionId: integer("promotion_id")
			.references(() => promotions.id)
			.notNull(),
		discountAmount: integer("discount_amount").notNull(), // Actual discount applied (in cents)
		type: text("type", { enum: ["order", "product", "shipping"] })
			.default("order")
			.notNull()
	},
	(table) => [
		primaryKey({ columns: [table.orderId, table.promotionId] }),
		index("order_promotions_order_idx").on(table.orderId)
	]
);

// ============================================================================
// COLLECTIONS (Smart Collections - Vendure/Shopify style)
// ============================================================================

export const collections = pgTable("collections", {
	id: serial("id").primaryKey(),
	name: varchar("name", { length: 255 }).default("").notNull(),
	slug: varchar("slug", { length: 255 }).default("").notNull(),
	description: text("description"),
	isPrivate: boolean("is_private").default(false).notNull(),
	featuredAssetId: integer("featured_asset_id").references(() => assets.id),
	position: integer("position").default(0).notNull(),
	createdAt: timestamp("created_at").defaultNow().notNull(),
	updatedAt: timestamp("updated_at")
		.defaultNow()
		.$onUpdate(() => new Date())
		.notNull()
});

export const collectionTranslations = pgTable(
	"collection_translations",
	{
		id: serial("id").primaryKey(),
		collectionId: integer("collection_id")
			.references(() => collections.id, { onDelete: "cascade" })
			.notNull(),
		languageCode: varchar("language_code", { length: 10 }).notNull(),
		name: varchar("name", { length: 255 }).notNull(),
		slug: varchar("slug", { length: 255 }).notNull(),
		description: text("description")
	},
	(table) => [
		uniqueIndex("collection_translations_collection_lang_idx").on(
			table.collectionId,
			table.languageCode
		),
		index("collection_translations_slug_idx").on(table.slug)
	]
);

// Collection filters - rules stored as rows, products derived dynamically
export const collectionFilters = pgTable(
	"collection_filters",
	{
		id: serial("id").primaryKey(),
		collectionId: integer("collection_id")
			.references(() => collections.id, { onDelete: "cascade" })
			.notNull(),
		field: text("field", {
			enum: ["facet", "price", "stock", "visibility", "product", "variant"]
		}).notNull(),
		operator: text("operator", {
			enum: ["eq", "in", "gte", "lte", "gt", "contains"]
		}).notNull(),
		value: jsonb("value").notNull(), // flexible payload
		createdAt: timestamp("created_at").defaultNow().notNull()
	},
	(table) => [index("collection_filters_collection_idx").on(table.collectionId)]
);

// ============================================================================
// CATEGORIES (Hierarchical navigation tree)
// ============================================================================

export const categories = pgTable(
	"categories",
	{
		id: serial("id").primaryKey(),
		name: varchar("name", { length: 255 }).default("").notNull(),
		parentId: integer("parent_id"),
		slug: varchar("slug", { length: 255 }).notNull().unique(),
		position: integer("position").default(0).notNull(),
		featuredAssetId: integer("featured_asset_id").references(() => assets.id),
		taxCode: varchar("tax_code", { length: 20 }).default("standard").notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull()
	},
	(table) => [
		uniqueIndex("categories_slug_idx").on(table.slug),
		index("categories_parent_idx").on(table.parentId)
	]
);

export const categoryTranslations = pgTable(
	"category_translations",
	{
		id: serial("id").primaryKey(),
		categoryId: integer("category_id")
			.references(() => categories.id, { onDelete: "cascade" })
			.notNull(),
		languageCode: varchar("language_code", { length: 10 }).notNull(),
		name: varchar("name", { length: 255 }).notNull()
	},
	(table) => [
		uniqueIndex("category_translations_category_lang_idx").on(
			table.categoryId,
			table.languageCode
		)
	]
);

export const productCategories = pgTable(
	"product_categories",
	{
		productId: integer("product_id")
			.references(() => products.id, { onDelete: "cascade" })
			.notNull(),
		categoryId: integer("category_id")
			.references(() => categories.id, { onDelete: "cascade" })
			.notNull()
	},
	(table) => [
		primaryKey({ columns: [table.productId, table.categoryId] }),
		index("product_categories_product_idx").on(table.productId),
		index("product_categories_category_idx").on(table.categoryId)
	]
);

// ============================================================================
// RELATED PRODUCTS
// ============================================================================

export const relatedProducts = pgTable(
	"related_products",
	{
		productId: integer("product_id")
			.references(() => products.id, { onDelete: "cascade" })
			.notNull(),
		relatedProductId: integer("related_product_id")
			.references(() => products.id, { onDelete: "cascade" })
			.notNull(),
		position: integer("position").default(0).notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull()
	},
	(table) => [
		primaryKey({ columns: [table.productId, table.relatedProductId] }),
		index("related_products_product_idx").on(table.productId),
		index("related_products_related_idx").on(table.relatedProductId)
	]
);

// ============================================================================
// REVIEWS
// ============================================================================

export const reviews = pgTable(
	"reviews",
	{
		id: serial("id").primaryKey(),
		productId: integer("product_id")
			.references(() => products.id, { onDelete: "cascade" })
			.notNull(),
		customerId: integer("customer_id")
			.references(() => customers.id, { onDelete: "cascade" })
			.notNull(),
		nickname: varchar("nickname", { length: 100 }).notNull(),
		rating: integer("rating").notNull(),
		comment: text("comment"),
		isVerifiedPurchase: boolean("is_verified_purchase").default(false).notNull(),
		status: text("status", { enum: ["pending", "approved", "rejected"] })
			.default("pending")
			.notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull()
	},
	(table) => [
		index("reviews_product_idx").on(table.productId),
		index("reviews_customer_idx").on(table.customerId),
		index("reviews_status_idx").on(table.status),
		uniqueIndex("reviews_product_customer_idx").on(table.productId, table.customerId)
	]
);

// ============================================================================
// WISHLISTS
// ============================================================================

export const wishlists = pgTable(
	"wishlists",
	{
		id: serial("id").primaryKey(),
		customerId: integer("customer_id").references(() => customers.id, { onDelete: "cascade" }),
		guestToken: varchar("guest_token", { length: 64 }).unique(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull()
	},
	(table) => [
		index("wishlists_customer_idx").on(table.customerId),
		index("wishlists_guest_token_idx").on(table.guestToken)
	]
);

export const wishlistItems = pgTable(
	"wishlist_items",
	{
		id: serial("id").primaryKey(),
		wishlistId: integer("wishlist_id")
			.references(() => wishlists.id, { onDelete: "cascade" })
			.notNull(),
		productId: integer("product_id")
			.references(() => products.id, { onDelete: "cascade" })
			.notNull(),
		variantId: integer("variant_id").references(() => productVariants.id, {
			onDelete: "cascade"
		}),
		addedAt: timestamp("added_at").defaultNow().notNull()
	},
	(table) => [
		index("wishlist_items_wishlist_idx").on(table.wishlistId),
		index("wishlist_items_product_idx").on(table.productId),
		uniqueIndex("wishlist_items_wishlist_product_idx").on(table.wishlistId, table.productId)
	]
);

// ============================================================================
// PRODUCT SEARCH (Denormalized search table)
// ============================================================================

export const productSearch = pgTable(
	"product_search",
	{
		productId: integer("product_id")
			.primaryKey()
			.references(() => products.id, { onDelete: "cascade" }),
		name: varchar("name", { length: 255 }).notNull(),
		slug: varchar("slug", { length: 255 }).notNull(),
		description: text("description"),
		visibility: text("visibility", {
			enum: ["public", "private", "draft"]
		}).notNull(),
		minPrice: integer("min_price"),
		maxPrice: integer("max_price"),
		inStock: boolean("in_stock").default(false).notNull(),
		featuredAsset: jsonb("featured_asset"),
		facets: jsonb("facets").default({}).notNull(),
		variantFacetImages: jsonb("variant_facet_images"),
		searchVector: tsvector("search_vector"),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull()
	},
	(table) => [
		index("product_search_vector_idx").using("gin", table.searchVector),
		index("product_search_facets_idx").using("gin", table.facets),
		index("product_search_visibility_idx").on(table.visibility)
	]
);

// ============================================================================
// RELATIONS
// These define the relationship graph for Drizzle's relational query API
// (db.query.*.findFirst/findMany with `with: { ... }`). They have no effect
// on the database or on standard select/insert/update/delete queries.
// Currently only productCategoriesRelations is actively used (with: { category }).
// ============================================================================

export const productsRelations = relations(products, ({ one, many }) => ({
	translations: many(productTranslations),
	variants: many(productVariants),
	facetValues: many(productFacetValues),
	assets: many(productAssets),
	reviews: many(reviews),
	categories: many(productCategories),
	featuredAsset: one(assets, {
		fields: [products.featuredAssetId],
		references: [assets.id]
	})
}));

export const productSearchRelations = relations(productSearch, ({ one }) => ({
	product: one(products, {
		fields: [productSearch.productId],
		references: [products.id]
	})
}));

export const productTranslationsRelations = relations(productTranslations, ({ one }) => ({
	product: one(products, {
		fields: [productTranslations.productId],
		references: [products.id]
	})
}));

export const productVariantsRelations = relations(productVariants, ({ one, many }) => ({
	product: one(products, {
		fields: [productVariants.productId],
		references: [products.id]
	}),
	translations: many(productVariantTranslations),
	facetValues: many(variantFacetValues),
	assets: many(productVariantAssets),
	featuredAsset: one(assets, {
		fields: [productVariants.featuredAssetId],
		references: [assets.id]
	}),
	orderLines: many(orderLines),
	groupPrices: many(productVariantGroupPrices),
	reservations: many(stockReservations)
}));

export const productVariantTranslationsRelations = relations(
	productVariantTranslations,
	({ one }) => ({
		variant: one(productVariants, {
			fields: [productVariantTranslations.variantId],
			references: [productVariants.id]
		})
	})
);

export const productVariantGroupPricesRelations = relations(
	productVariantGroupPrices,
	({ one }) => ({
		variant: one(productVariants, {
			fields: [productVariantGroupPrices.variantId],
			references: [productVariants.id]
		}),
		group: one(customerGroups, {
			fields: [productVariantGroupPrices.groupId],
			references: [customerGroups.id]
		})
	})
);

export const facetsRelations = relations(facets, ({ many }) => ({
	translations: many(facetTranslations),
	values: many(facetValues)
}));

export const facetTranslationsRelations = relations(facetTranslations, ({ one }) => ({
	facet: one(facets, {
		fields: [facetTranslations.facetId],
		references: [facets.id]
	})
}));

export const facetValuesRelations = relations(facetValues, ({ one, many }) => ({
	facet: one(facets, {
		fields: [facetValues.facetId],
		references: [facets.id]
	}),
	translations: many(facetValueTranslations),
	products: many(productFacetValues),
	variants: many(variantFacetValues)
}));

export const facetValueTranslationsRelations = relations(facetValueTranslations, ({ one }) => ({
	facetValue: one(facetValues, {
		fields: [facetValueTranslations.facetValueId],
		references: [facetValues.id]
	})
}));

export const productFacetValuesRelations = relations(productFacetValues, ({ one }) => ({
	product: one(products, {
		fields: [productFacetValues.productId],
		references: [products.id]
	}),
	facetValue: one(facetValues, {
		fields: [productFacetValues.facetValueId],
		references: [facetValues.id]
	})
}));

export const variantFacetValuesRelations = relations(variantFacetValues, ({ one }) => ({
	variant: one(productVariants, {
		fields: [variantFacetValues.variantId],
		references: [productVariants.id]
	}),
	facetValue: one(facetValues, {
		fields: [variantFacetValues.facetValueId],
		references: [facetValues.id]
	})
}));

export const assetsRelations = relations(assets, ({ many }) => ({
	translations: many(assetTranslations),
	productAssets: many(productAssets),
	variantAssets: many(productVariantAssets)
}));

export const assetTranslationsRelations = relations(assetTranslations, ({ one }) => ({
	asset: one(assets, {
		fields: [assetTranslations.assetId],
		references: [assets.id]
	})
}));

export const productAssetsRelations = relations(productAssets, ({ one }) => ({
	product: one(products, {
		fields: [productAssets.productId],
		references: [products.id]
	}),
	asset: one(assets, {
		fields: [productAssets.assetId],
		references: [assets.id]
	})
}));

export const productVariantAssetsRelations = relations(productVariantAssets, ({ one }) => ({
	variant: one(productVariants, {
		fields: [productVariantAssets.variantId],
		references: [productVariants.id]
	}),
	asset: one(assets, {
		fields: [productVariantAssets.assetId],
		references: [assets.id]
	})
}));

export const customerGroupsRelations = relations(customerGroups, ({ many }) => ({
	members: many(customerGroupMembers),
	groupPrices: many(productVariantGroupPrices)
}));

export const customerGroupMembersRelations = relations(customerGroupMembers, ({ one }) => ({
	customer: one(customers, {
		fields: [customerGroupMembers.customerId],
		references: [customers.id]
	}),
	group: one(customerGroups, {
		fields: [customerGroupMembers.groupId],
		references: [customerGroups.id]
	})
}));

export const customersRelations = relations(customers, ({ many }) => ({
	groupMemberships: many(customerGroupMembers),
	addresses: many(addresses),
	orders: many(orders),
	reviews: many(reviews)
}));

export const addressesRelations = relations(addresses, ({ one }) => ({
	customer: one(customers, {
		fields: [addresses.customerId],
		references: [customers.id]
	})
}));

export const ordersRelations = relations(orders, ({ one, many }) => ({
	customer: one(customers, {
		fields: [orders.customerId],
		references: [customers.id]
	}),
	lines: many(orderLines),
	payments: many(payments),
	promotions: many(orderPromotions),
	shipping: one(orderShipping),
	reservations: many(stockReservations)
}));

export const orderLinesRelations = relations(orderLines, ({ one }) => ({
	order: one(orders, {
		fields: [orderLines.orderId],
		references: [orders.id]
	}),
	variant: one(productVariants, {
		fields: [orderLines.variantId],
		references: [productVariants.id]
	}),
	reservation: one(stockReservations)
}));

export const stockReservationsRelations = relations(stockReservations, ({ one }) => ({
	variant: one(productVariants, {
		fields: [stockReservations.variantId],
		references: [productVariants.id]
	}),
	order: one(orders, {
		fields: [stockReservations.orderId],
		references: [orders.id]
	}),
	orderLine: one(orderLines, {
		fields: [stockReservations.orderLineId],
		references: [orderLines.id]
	})
}));

export const paymentMethodsRelations = relations(paymentMethods, ({ many }) => ({
	payments: many(payments)
}));

export const paymentsRelations = relations(payments, ({ one }) => ({
	order: one(orders, {
		fields: [payments.orderId],
		references: [orders.id]
	}),
	paymentMethod: one(paymentMethods, {
		fields: [payments.paymentMethodId],
		references: [paymentMethods.id]
	})
}));

export const promotionsRelations = relations(promotions, ({ one, many }) => ({
	orderPromotions: many(orderPromotions),
	promotionProducts: many(promotionProducts),
	promotionCollections: many(promotionCollections),
	customerGroup: one(customerGroups, {
		fields: [promotions.customerGroupId],
		references: [customerGroups.id]
	})
}));

export const promotionProductsRelations = relations(promotionProducts, ({ one }) => ({
	promotion: one(promotions, {
		fields: [promotionProducts.promotionId],
		references: [promotions.id]
	}),
	product: one(products, {
		fields: [promotionProducts.productId],
		references: [products.id]
	})
}));

export const promotionCollectionsRelations = relations(promotionCollections, ({ one }) => ({
	promotion: one(promotions, {
		fields: [promotionCollections.promotionId],
		references: [promotions.id]
	}),
	collection: one(collections, {
		fields: [promotionCollections.collectionId],
		references: [collections.id]
	})
}));

export const orderPromotionsRelations = relations(orderPromotions, ({ one }) => ({
	order: one(orders, {
		fields: [orderPromotions.orderId],
		references: [orders.id]
	}),
	promotion: one(promotions, {
		fields: [orderPromotions.promotionId],
		references: [promotions.id]
	})
}));

export const shippingMethodsRelations = relations(shippingMethods, ({ many }) => ({
	orderShippings: many(orderShipping)
}));

export const orderShippingRelations = relations(orderShipping, ({ one }) => ({
	order: one(orders, {
		fields: [orderShipping.orderId],
		references: [orders.id]
	}),
	shippingMethod: one(shippingMethods, {
		fields: [orderShipping.shippingMethodId],
		references: [shippingMethods.id]
	})
}));

export const collectionsRelations = relations(collections, ({ one, many }) => ({
	translations: many(collectionTranslations),
	filters: many(collectionFilters),
	featuredAsset: one(assets, {
		fields: [collections.featuredAssetId],
		references: [assets.id]
	})
}));

export const collectionTranslationsRelations = relations(collectionTranslations, ({ one }) => ({
	collection: one(collections, {
		fields: [collectionTranslations.collectionId],
		references: [collections.id]
	})
}));

export const collectionFiltersRelations = relations(collectionFilters, ({ one }) => ({
	collection: one(collections, {
		fields: [collectionFilters.collectionId],
		references: [collections.id]
	})
}));

export const categoriesRelations = relations(categories, ({ one, many }) => ({
	parent: one(categories, {
		fields: [categories.parentId],
		references: [categories.id],
		relationName: "parentChild"
	}),
	children: many(categories, { relationName: "parentChild" }),
	translations: many(categoryTranslations),
	products: many(productCategories),
	featuredAsset: one(assets, {
		fields: [categories.featuredAssetId],
		references: [assets.id]
	})
}));

export const categoryTranslationsRelations = relations(categoryTranslations, ({ one }) => ({
	category: one(categories, {
		fields: [categoryTranslations.categoryId],
		references: [categories.id]
	})
}));

export const productCategoriesRelations = relations(productCategories, ({ one }) => ({
	product: one(products, {
		fields: [productCategories.productId],
		references: [products.id]
	}),
	category: one(categories, {
		fields: [productCategories.categoryId],
		references: [categories.id]
	})
}));

export const reviewsRelations = relations(reviews, ({ one }) => ({
	product: one(products, {
		fields: [reviews.productId],
		references: [products.id]
	}),
	customer: one(customers, {
		fields: [reviews.customerId],
		references: [customers.id]
	})
}));

export const wishlistsRelations = relations(wishlists, ({ one, many }) => ({
	customer: one(customers, {
		fields: [wishlists.customerId],
		references: [customers.id]
	}),
	items: many(wishlistItems)
}));

export const wishlistItemsRelations = relations(wishlistItems, ({ one }) => ({
	wishlist: one(wishlists, {
		fields: [wishlistItems.wishlistId],
		references: [wishlists.id]
	}),
	product: one(products, {
		fields: [wishlistItems.productId],
		references: [products.id]
	}),
	variant: one(productVariants, {
		fields: [wishlistItems.variantId],
		references: [productVariants.id]
	})
}));

// Admin users and sessions are now managed by Neon Auth (neon_auth schema)

// ============================================================================
// CONTENT PAGES
// ============================================================================

export const contentPages = pgTable("content_pages", {
	id: serial("id").primaryKey(),
	title: varchar("title", { length: 255 }).default("").notNull(),
	slug: varchar("slug", { length: 255 }).default("").notNull(),
	body: text("body"),
	imageUrl: varchar("image_url", { length: 500 }),
	published: boolean("published").default(false).notNull(),
	createdAt: timestamp("created_at").defaultNow().notNull(),
	updatedAt: timestamp("updated_at")
		.defaultNow()
		.$onUpdate(() => new Date())
		.notNull()
});

export const contentPageTranslations = pgTable(
	"content_page_translations",
	{
		id: serial("id").primaryKey(),
		contentPageId: integer("content_page_id")
			.references(() => contentPages.id, { onDelete: "cascade" })
			.notNull(),
		languageCode: varchar("language_code", { length: 10 }).notNull(),
		title: varchar("title", { length: 255 }).notNull(),
		slug: varchar("slug", { length: 255 }).notNull(),
		body: text("body")
	},
	(table) => [
		uniqueIndex("content_page_translations_page_lang_idx").on(
			table.contentPageId,
			table.languageCode
		),
		index("content_page_translations_slug_idx").on(table.slug)
	]
);

export const contentPagesRelations = relations(contentPages, ({ many }) => ({
	translations: many(contentPageTranslations)
}));

export const contentPageTranslationsRelations = relations(contentPageTranslations, ({ one }) => ({
	contentPage: one(contentPages, {
		fields: [contentPageTranslations.contentPageId],
		references: [contentPages.id]
	})
}));
