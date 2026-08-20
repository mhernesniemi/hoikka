/**
 * Drizzle Schema for Hoikka (SQLite)
 *
 * Notes on conventions:
 * - Timestamps are stored as integer milliseconds via `integer({ mode: "timestamp_ms" })`.
 *   Defaults and $onUpdate are set in the app layer via Drizzle so behavior matches
 *   across better-sqlite3 (node) and D1 (cloudflare).
 * - "Numeric" rates are stored as integer basis points to avoid floating-point drift:
 *     - tax rates: ×10_000 (e.g. 24%  = 2400)
 *     - exchange rates: ×1_000_000 (e.g. 1.0 = 1_000_000)
 *   Focal points are `real` since exact precision is not critical.
 * - `jsonb` columns map to `text({ mode: "json" })`. Drizzle handles JSON.parse/stringify.
 * - Full-text search (previously tsvector + `product_search` table) is now an FTS5
 *   virtual table created via a raw SQL migration — not part of this file.
 */
import { sql } from "drizzle-orm";
import {
	sqliteTable,
	text,
	integer,
	real,
	primaryKey,
	index,
	uniqueIndex
} from "drizzle-orm/sqlite-core";

// Helpers keep the schema terse and consistent.
const pk = () => integer("id").primaryKey({ autoIncrement: true });
const now = () =>
	integer({ mode: "timestamp_ms" })
		.$defaultFn(() => new Date())
		.notNull();
const updatedNow = () =>
	integer({ mode: "timestamp_ms" })
		.$defaultFn(() => new Date())
		.$onUpdate(() => new Date())
		.notNull();
const ts = (name: string) => integer(name, { mode: "timestamp_ms" });
const bool = (name: string) => integer(name, { mode: "boolean" });

// ============================================================================
// AUTH (Better Auth)
// Table names and columns follow Better Auth's default schema. Custom `role`
// field added for admin detection. Drizzle migration creates these; Better Auth
// reads/writes them via its drizzleAdapter.
// ============================================================================

export const user = sqliteTable("user", {
	id: text("id").primaryKey(),
	name: text("name").notNull(),
	email: text("email").notNull().unique(),
	emailVerified: bool("email_verified").default(false).notNull(),
	image: text("image"),
	role: text("role").default("customer").notNull(),
	createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
	updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull()
});

export const session = sqliteTable("session", {
	id: text("id").primaryKey(),
	expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
	token: text("token").notNull().unique(),
	createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
	updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
	ipAddress: text("ip_address"),
	userAgent: text("user_agent"),
	userId: text("user_id")
		.notNull()
		.references(() => user.id, { onDelete: "cascade" })
});

export const account = sqliteTable("account", {
	id: text("id").primaryKey(),
	accountId: text("account_id").notNull(),
	providerId: text("provider_id").notNull(),
	userId: text("user_id")
		.notNull()
		.references(() => user.id, { onDelete: "cascade" }),
	accessToken: text("access_token"),
	refreshToken: text("refresh_token"),
	idToken: text("id_token"),
	accessTokenExpiresAt: integer("access_token_expires_at", { mode: "timestamp_ms" }),
	refreshTokenExpiresAt: integer("refresh_token_expires_at", { mode: "timestamp_ms" }),
	scope: text("scope"),
	password: text("password"),
	createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
	updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull()
});

export const verification = sqliteTable("verification", {
	id: text("id").primaryKey(),
	identifier: text("identifier").notNull(),
	value: text("value").notNull(),
	expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
	createdAt: integer("created_at", { mode: "timestamp_ms" }),
	updatedAt: integer("updated_at", { mode: "timestamp_ms" })
});

// ============================================================================
// TAX RATES
// ============================================================================

export const taxRates = sqliteTable("tax_rates", {
	code: text("code").primaryKey(),
	rate: integer("rate").notNull(), // basis points: 0.24 stored as 2400
	name: text("name").notNull(),
	createdAt: now()
});

// ============================================================================
// PRODUCTS
// ============================================================================

export const products = sqliteTable(
	"products",
	{
		id: pk(),
		name: text("name").default("").notNull(),
		slug: text("slug").default("").notNull(),
		description: text("description"),
		type: text("type", { enum: ["physical", "digital"] })
			.default("physical")
			.notNull(),
		visibility: text("visibility", { enum: ["public", "private", "draft"] })
			.default("public")
			.notNull(),
		taxCode: text("tax_code").default("standard").notNull(),
		featuredAssetId: integer("featured_asset_id"),
		// The file a "digital" product delivers after payment. Without it a
		// digital product cannot be fulfilled — checkout completion records a
		// fulfilment error on the order instead of silently sending nothing.
		digitalAssetId: integer("digital_asset_id"),
		deletedAt: ts("deleted_at"),
		createdAt: now(),
		updatedAt: updatedNow()
	},
	(table) => [
		index("products_visibility_idx").on(table.visibility),
		index("products_created_at_idx").on(table.createdAt)
	]
);

export const productTranslations = sqliteTable(
	"product_translations",
	{
		id: pk(),
		productId: integer("product_id")
			.references(() => products.id, { onDelete: "cascade" })
			.notNull(),
		languageCode: text("language_code").notNull(),
		name: text("name").notNull(),
		slug: text("slug").notNull(),
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

export const productVariants = sqliteTable(
	"product_variants",
	{
		id: pk(),
		productId: integer("product_id")
			.references(() => products.id, { onDelete: "cascade" })
			.notNull(),
		name: text("name"),
		sku: text("sku").notNull(),
		price: integer("price").notNull(), // cents
		stock: integer("stock").default(0).notNull(),
		trackInventory: bool("track_inventory").default(true).notNull(),
		featuredAssetId: integer("featured_asset_id"),
		imageUrl: text("image_url"),
		isFeatured: bool("is_featured").default(false).notNull(),
		deletedAt: ts("deleted_at"),
		createdAt: now(),
		updatedAt: updatedNow()
	},
	(table) => [
		uniqueIndex("product_variants_sku_idx").on(table.sku),
		index("product_variants_product_idx").on(table.productId)
	]
);

export const productVariantTranslations = sqliteTable(
	"product_variant_translations",
	{
		id: pk(),
		variantId: integer("variant_id")
			.references(() => productVariants.id, { onDelete: "cascade" })
			.notNull(),
		languageCode: text("language_code").notNull(),
		name: text("name")
	},
	(table) => [
		uniqueIndex("product_variant_translations_variant_lang_idx").on(
			table.variantId,
			table.languageCode
		)
	]
);

// B2B Group Pricing
export const productVariantGroupPrices = sqliteTable(
	"product_variant_group_prices",
	{
		id: pk(),
		variantId: integer("variant_id")
			.references(() => productVariants.id, { onDelete: "cascade" })
			.notNull(),
		groupId: integer("group_id").notNull(),
		price: integer("price").notNull(),
		createdAt: now(),
		updatedAt: updatedNow()
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

export const facets = sqliteTable("facets", {
	id: pk(),
	name: text("name").default("").notNull(),
	code: text("code").notNull().unique(),
	isHidden: bool("is_hidden").default(false).notNull(),
	createdAt: now(),
	updatedAt: updatedNow()
});

export const facetTranslations = sqliteTable(
	"facet_translations",
	{
		id: pk(),
		facetId: integer("facet_id")
			.references(() => facets.id, { onDelete: "cascade" })
			.notNull(),
		languageCode: text("language_code").notNull(),
		name: text("name").notNull()
	},
	(table) => [
		uniqueIndex("facet_translations_facet_lang_idx").on(table.facetId, table.languageCode)
	]
);

export const facetValues = sqliteTable(
	"facet_values",
	{
		id: pk(),
		facetId: integer("facet_id")
			.references(() => facets.id, { onDelete: "cascade" })
			.notNull(),
		name: text("name").default("").notNull(),
		code: text("code").notNull(),
		createdAt: now(),
		updatedAt: updatedNow()
	},
	(table) => [
		uniqueIndex("facet_values_facet_code_idx").on(table.facetId, table.code),
		index("facet_values_facet_idx").on(table.facetId)
	]
);

export const facetValueTranslations = sqliteTable(
	"facet_value_translations",
	{
		id: pk(),
		facetValueId: integer("facet_value_id")
			.references(() => facetValues.id, { onDelete: "cascade" })
			.notNull(),
		languageCode: text("language_code").notNull(),
		name: text("name").notNull()
	},
	(table) => [
		uniqueIndex("facet_value_translations_value_lang_idx").on(
			table.facetValueId,
			table.languageCode
		)
	]
);

export const productFacetValues = sqliteTable(
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

export const variantFacetValues = sqliteTable(
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

export const assets = sqliteTable("assets", {
	id: pk(),
	name: text("name").notNull(),
	type: text("type", { enum: ["image", "video", "document", "other"] }).notNull(),
	mimeType: text("mime_type").notNull(),
	width: integer("width").default(0),
	height: integer("height").default(0),
	fileSize: integer("file_size").default(0),
	source: text("source").notNull(),
	alt: text("alt"),
	focalX: real("focal_x").default(0.5).notNull(),
	focalY: real("focal_y").default(0.5).notNull(),
	createdAt: now()
});

export const assetTranslations = sqliteTable(
	"asset_translations",
	{
		id: pk(),
		assetId: integer("asset_id")
			.references(() => assets.id, { onDelete: "cascade" })
			.notNull(),
		languageCode: text("language_code").notNull(),
		alt: text("alt")
	},
	(table) => [
		uniqueIndex("asset_translations_asset_lang_idx").on(table.assetId, table.languageCode)
	]
);

export const productAssets = sqliteTable(
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

export const productVariantAssets = sqliteTable(
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

export const customerGroups = sqliteTable(
	"customer_groups",
	{
		id: pk(),
		code: text("code").notNull().unique(),
		name: text("name").notNull(),
		description: text("description"),
		isTaxExempt: bool("is_tax_exempt").default(false).notNull(),
		createdAt: now(),
		updatedAt: updatedNow()
	},
	(table) => [uniqueIndex("customer_groups_code_idx").on(table.code)]
);

export const customerGroupMembers = sqliteTable(
	"customer_group_members",
	{
		customerId: integer("customer_id")
			.references(() => customers.id, { onDelete: "cascade" })
			.notNull(),
		groupId: integer("group_id")
			.references(() => customerGroups.id, { onDelete: "cascade" })
			.notNull(),
		createdAt: now()
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

export const customers = sqliteTable(
	"customers",
	{
		id: pk(),
		authUserId: text("auth_user_id").unique(),
		email: text("email").notNull(),
		firstName: text("first_name").notNull(),
		lastName: text("last_name").notNull(),
		phone: text("phone"),
		vatId: text("vat_id"),
		deletedAt: ts("deleted_at"),
		createdAt: now(),
		updatedAt: updatedNow()
	},
	(table) => [
		uniqueIndex("customers_email_idx").on(table.email),
		uniqueIndex("customers_auth_user_id_idx").on(table.authUserId),
		index("customers_name_idx").on(table.firstName, table.lastName)
	]
);

export const addresses = sqliteTable(
	"addresses",
	{
		id: pk(),
		customerId: integer("customer_id")
			.references(() => customers.id, { onDelete: "cascade" })
			.notNull(),
		fullName: text("full_name"),
		company: text("company"),
		streetLine1: text("street_line_1").notNull(),
		streetLine2: text("street_line_2"),
		city: text("city").notNull(),
		postalCode: text("postal_code").notNull(),
		country: text("country").notNull(),
		phoneNumber: text("phone_number"),
		isDefault: bool("is_default").default(false).notNull(),
		createdAt: now(),
		updatedAt: updatedNow()
	},
	(table) => [index("addresses_customer_idx").on(table.customerId)]
);

// ============================================================================
// ORDERS
// ============================================================================

export const orders = sqliteTable(
	"orders",
	{
		id: pk(),
		code: text("code").notNull().unique(),
		customerId: integer("customer_id").references(() => customers.id, { onDelete: "set null" }),
		// Identifies a draft checkout (active=true, state=created) for the
		// checkout_token cookie
		checkoutToken: text("checkout_token").unique(),
		active: bool("active").default(true).notNull(),
		state: text("state", {
			enum: ["created", "payment_pending", "paid", "shipped", "delivered", "cancelled"]
		})
			.notNull()
			.default("created"),
		// Pricing (cents)
		subtotal: integer("subtotal").default(0).notNull(),
		shipping: integer("shipping").default(0).notNull(),
		discount: integer("discount").default(0).notNull(),
		total: integer("total").default(0).notNull(),
		// Tax
		taxTotal: integer("tax_total").default(0).notNull(),
		totalNet: integer("total_net").default(0).notNull(),
		isTaxExempt: bool("is_tax_exempt").default(false).notNull(),
		currencyCode: text("currency_code").default("EUR").notNull(),
		// Basis points with 6 decimals: 1.0 = 1_000_000
		exchangeRate: integer("exchange_rate").default(1_000_000).notNull(),
		// Shipping address snapshot
		shippingFullName: text("shipping_full_name"),
		shippingStreetLine1: text("shipping_street_line_1"),
		shippingStreetLine2: text("shipping_street_line_2"),
		shippingCity: text("shipping_city"),
		shippingPostalCode: text("shipping_postal_code"),
		shippingCountry: text("shipping_country"),
		customerEmail: text("customer_email"),
		// Set when post-payment fulfilment could not be carried out (e.g. a
		// digital product with no file, or delivery email retries exhausted).
		// Surfaced on the admin order page so someone can act on it.
		fulfillmentError: text("fulfillment_error"),
		// Fulfilment is its own idempotent step, separate from "paid": it is
		// stamped only once shipment, download grants and the outbox events are
		// all durably recorded, so a crash between payment and fulfilment is
		// retried instead of being reported as done.
		fulfilledAt: ts("fulfilled_at"),
		// Lease held while fulfilment is running, so a webhook and a browser
		// arriving together cannot both create shipments and enqueue the same
		// events. A crash mid-fulfilment simply lets the lease expire.
		fulfillmentClaimedAt: ts("fulfillment_claimed_at"),
		// Bumped whenever the order's money changes. Gateways get an
		// idempotency key derived from it, so two concurrent "start payment"
		// requests for the same order and total collapse into one intent.
		paymentRevision: integer("payment_revision").default(0).notNull(),
		orderPlacedAt: ts("order_placed_at"),
		createdAt: now(),
		updatedAt: updatedNow()
	},
	(table) => [
		index("orders_customer_idx").on(table.customerId),
		index("orders_state_idx").on(table.state),
		index("orders_placed_at_idx").on(table.orderPlacedAt),
		index("orders_active_idx").on(table.active),
		// Drives the abandoned-draft sweep
		index("orders_draft_sweep_idx").on(table.state, table.active, table.updatedAt),
		index("orders_checkout_token_idx").on(table.checkoutToken)
	]
);

export const orderLines = sqliteTable(
	"order_lines",
	{
		id: pk(),
		orderId: integer("order_id")
			.references(() => orders.id, { onDelete: "cascade" })
			.notNull(),
		variantId: integer("variant_id")
			.references(() => productVariants.id)
			.notNull(),
		quantity: integer("quantity").notNull(),
		unitPrice: integer("unit_price").notNull(),
		lineTotal: integer("line_total").notNull(),
		taxCode: text("tax_code").default("standard").notNull(),
		// Basis points with 4 decimals: 0.24 = 2400
		taxRate: integer("tax_rate").default(2400).notNull(),
		taxAmount: integer("tax_amount").default(0).notNull(),
		unitPriceNet: integer("unit_price_net").default(0).notNull(),
		lineTotalNet: integer("line_total_net").default(0).notNull(),
		productName: text("product_name").notNull(),
		variantName: text("variant_name"),
		sku: text("sku").notNull(),
		// The deliverable this line was sold with, pinned when the payment is
		// created. Prices and names are snapshotted onto the line for the same
		// reason: what the customer bought must not change under them because
		// somebody edited the product afterwards. Reading the product's *current*
		// file at fulfilment time made that a race — detach it after the
		// pre-payment check and the buyer is charged for nothing.
		//
		// Deliberately not a foreign key. Adding one to an existing SQLite
		// column forces a table rebuild, and dropping order_lines cascades into
		// stock_reservations and digital_downloads — on D1 that silently
		// destroys them, because foreign keys cannot be turned off inside a
		// migration there. The same guarantee is enforced by the
		// assets_not_deletable_while_sold trigger, which needs no rebuild.
		digitalAssetId: integer("digital_asset_id"),
		// How this line was sold, pinned alongside the deliverable. Fulfilment
		// must not consult products.type: flip a product from physical to
		// digital after the sale and the shipment is silently skipped, with no
		// download to replace it because nothing was ever pinned.
		fulfillmentType: text("fulfillment_type", { enum: ["physical", "digital"] }),
		createdAt: now()
	},
	(table) => [
		index("order_lines_order_idx").on(table.orderId),
		index("order_lines_variant_idx").on(table.variantId)
	]
);

// ============================================================================
// STOCK RESERVATIONS
// ============================================================================

export const stockReservations = sqliteTable(
	"stock_reservations",
	{
		id: pk(),
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
		expiresAt: ts("expires_at").notNull(),
		createdAt: now()
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

export const paymentMethods = sqliteTable(
	"payment_methods",
	{
		id: pk(),
		code: text("code").notNull().unique(),
		name: text("name").notNull(),
		description: text("description"),
		active: bool("active").default(true).notNull(),
		createdAt: now(),
		updatedAt: updatedNow()
	},
	(table) => [
		uniqueIndex("payment_methods_code_idx").on(table.code),
		index("payment_methods_active_idx").on(table.active)
	]
);

export const payments = sqliteTable(
	"payments",
	{
		id: pk(),
		orderId: integer("order_id")
			.references(() => orders.id, { onDelete: "cascade" })
			.notNull(),
		paymentMethodId: integer("payment_method_id")
			.references(() => paymentMethods.id)
			.notNull(),
		method: text("method").notNull(),
		amount: integer("amount").notNull(),
		// "declined" is the gateway's verdict on an attempt (the shopper can try
		// another card on the same intent); "cancelled" is ours — the payment
		// was superseded and must never be honoured. Keeping them apart is what
		// lets a retried card succeed while a voided intent that somehow
		// captures is flagged as a charge needing a refund.
		state: text("state", {
			enum: ["pending", "authorized", "settled", "declined", "cancelled", "refunded"]
		})
			.notNull()
			.default("pending"),
		transactionId: text("transaction_id"),
		errorMessage: text("error_message"),
		metadata: text("metadata", { mode: "json" }),
		createdAt: now(),
		updatedAt: updatedNow()
	},
	(table) => [
		index("payments_order_idx").on(table.orderId),
		index("payments_method_idx").on(table.paymentMethodId),
		index("payments_state_idx").on(table.state),
		index("payments_transaction_idx").on(table.transactionId),
		// At most one chargeable payment per order at a time. Two concurrent
		// checkout requests would otherwise each create their own intent and
		// both could settle; the loser of this index reuses the winner's.
		uniqueIndex("payments_one_active_per_order_idx")
			.on(table.orderId)
			.where(sql`${table.state} in ('pending', 'authorized')`)
	]
);

// ============================================================================
// RATE LIMITING
// ============================================================================

/**
 * Fixed-window counters for the few endpoints that write to the database
 * before anyone is authenticated. Kept in the database rather than in memory
 * so the limit holds across Worker isolates and Node processes alike.
 */
export const rateLimits = sqliteTable(
	"rate_limits",
	{
		key: text("key").primaryKey(),
		windowStart: ts("window_start").notNull(),
		count: integer("count").default(0).notNull()
	},
	(table) => [index("rate_limits_window_idx").on(table.windowStart)]
);

// ============================================================================
// DIGITAL FULFILMENT
// ============================================================================

/**
 * One download grant per digital order line. The token is the capability:
 * knowing it (and nothing else) authorises the download, so it is random,
 * unguessable, expiring and use-limited. Nothing about the file itself is ever
 * exposed to the buyer — the download route resolves the asset server-side.
 */
export const digitalDownloads = sqliteTable(
	"digital_downloads",
	{
		id: pk(),
		orderId: integer("order_id")
			.references(() => orders.id, { onDelete: "cascade" })
			.notNull(),
		orderLineId: integer("order_line_id")
			.references(() => orderLines.id, { onDelete: "cascade" })
			.notNull(),
		// restrict, not cascade: deleting an asset must never silently revoke a
		// download somebody paid for. assetService.delete refuses first, this
		// is the backstop.
		assetId: integer("asset_id")
			.references(() => assets.id, { onDelete: "restrict" })
			.notNull(),
		token: text("token").notNull().unique(),
		expiresAt: ts("expires_at").notNull(),
		downloadCount: integer("download_count").default(0).notNull(),
		maxDownloads: integer("max_downloads").default(10).notNull(),
		createdAt: now()
	},
	(table) => [
		uniqueIndex("digital_downloads_token_idx").on(table.token),
		uniqueIndex("digital_downloads_line_idx").on(table.orderLineId),
		index("digital_downloads_order_idx").on(table.orderId)
	]
);

// ============================================================================
// SHIPPING
// ============================================================================

export const shippingMethods = sqliteTable(
	"shipping_methods",
	{
		id: pk(),
		code: text("code").notNull().unique(),
		name: text("name").notNull(),
		description: text("description"),
		active: bool("active").default(true).notNull(),
		createdAt: now(),
		updatedAt: updatedNow()
	},
	(table) => [
		uniqueIndex("shipping_methods_code_idx").on(table.code),
		index("shipping_methods_active_idx").on(table.active)
	]
);

export const orderShipping = sqliteTable(
	"order_shipping",
	{
		id: pk(),
		orderId: integer("order_id")
			.references(() => orders.id, { onDelete: "cascade" })
			.notNull(),
		shippingMethodId: integer("shipping_method_id")
			.references(() => shippingMethods.id)
			.notNull(),
		trackingNumber: text("tracking_number"),
		status: text("status", { enum: ["pending", "shipped", "in_transit", "delivered", "error"] })
			.default("pending")
			.notNull(),
		price: integer("price").notNull(),
		metadata: text("metadata", { mode: "json" }),
		createdAt: now(),
		updatedAt: updatedNow()
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

export const promotions = sqliteTable(
	"promotions",
	{
		id: pk(),
		method: text("method", { enum: ["code", "automatic"] })
			.default("code")
			.notNull(),
		code: text("code").unique(),
		title: text("title"),
		promotionType: text("promotion_type", { enum: ["order", "product", "free_shipping"] })
			.default("order")
			.notNull(),
		discountType: text("discount_type", { enum: ["percentage", "fixed_amount"] }).notNull(),
		discountValue: integer("discount_value").notNull(),
		appliesTo: text("applies_to", {
			enum: ["all", "specific_products", "specific_collections"]
		})
			.default("all")
			.notNull(),
		minOrderAmount: integer("min_order_amount"),
		usageLimit: integer("usage_limit"),
		usageCount: integer("usage_count").default(0).notNull(),
		usageLimitPerCustomer: integer("usage_limit_per_customer"),
		combinesWithOtherPromotions: bool("combines_with_other_promotions")
			.default(false)
			.notNull(),
		enabled: bool("enabled").default(true).notNull(),
		customerGroupId: integer("customer_group_id").references(() => customerGroups.id, {
			onDelete: "set null"
		}),
		startsAt: ts("starts_at"),
		endsAt: ts("ends_at"),
		createdAt: now(),
		updatedAt: updatedNow()
	},
	(table) => [
		index("promotions_code_idx").on(table.code),
		index("promotions_enabled_idx").on(table.enabled)
	]
);

/**
 * One row per (promotion, customer, order) that actually settled.
 *
 * Counting past orders to enforce `usageLimitPerCustomer` is a read, and two
 * concurrent checkouts for the same account both pass it. Writing the usage as
 * a row inside the paid transaction turns the limit into something the
 * database enforces (see the trigger in migration 0009) rather than something
 * a query hopes is still true.
 */
export const promotionUsages = sqliteTable(
	"promotion_usages",
	{
		id: pk(),
		promotionId: integer("promotion_id")
			.references(() => promotions.id, { onDelete: "cascade" })
			.notNull(),
		customerId: integer("customer_id")
			.references(() => customers.id, { onDelete: "cascade" })
			.notNull(),
		orderId: integer("order_id")
			.references(() => orders.id, { onDelete: "cascade" })
			.notNull(),
		createdAt: now()
	},
	(table) => [
		uniqueIndex("promotion_usages_unique_idx").on(
			table.promotionId,
			table.customerId,
			table.orderId
		),
		index("promotion_usages_customer_idx").on(table.promotionId, table.customerId)
	]
);

export const promotionProducts = sqliteTable(
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

export const promotionCollections = sqliteTable(
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

export const orderPromotions = sqliteTable(
	"order_promotions",
	{
		orderId: integer("order_id")
			.references(() => orders.id, { onDelete: "cascade" })
			.notNull(),
		promotionId: integer("promotion_id")
			.references(() => promotions.id)
			.notNull(),
		discountAmount: integer("discount_amount").notNull(),
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
// COLLECTIONS
// ============================================================================

export const collections = sqliteTable("collections", {
	id: pk(),
	name: text("name").default("").notNull(),
	slug: text("slug").default("").notNull(),
	description: text("description"),
	isPrivate: bool("is_private").default(false).notNull(),
	featuredAssetId: integer("featured_asset_id").references(() => assets.id),
	position: integer("position").default(0).notNull(),
	createdAt: now(),
	updatedAt: updatedNow()
});

export const collectionTranslations = sqliteTable(
	"collection_translations",
	{
		id: pk(),
		collectionId: integer("collection_id")
			.references(() => collections.id, { onDelete: "cascade" })
			.notNull(),
		languageCode: text("language_code").notNull(),
		name: text("name").notNull(),
		slug: text("slug").notNull(),
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

export const collectionFilters = sqliteTable(
	"collection_filters",
	{
		id: pk(),
		collectionId: integer("collection_id")
			.references(() => collections.id, { onDelete: "cascade" })
			.notNull(),
		field: text("field", {
			enum: ["facet", "price", "stock", "visibility", "product", "variant"]
		}).notNull(),
		operator: text("operator", {
			enum: ["eq", "in", "gte", "lte", "gt", "contains"]
		}).notNull(),
		value: text("value", { mode: "json" }).notNull(),
		createdAt: now()
	},
	(table) => [index("collection_filters_collection_idx").on(table.collectionId)]
);

// ============================================================================
// CATEGORIES (Hierarchical)
// ============================================================================

export const categories = sqliteTable(
	"categories",
	{
		id: pk(),
		name: text("name").default("").notNull(),
		parentId: integer("parent_id"),
		slug: text("slug").notNull().unique(),
		position: integer("position").default(0).notNull(),
		featuredAssetId: integer("featured_asset_id").references(() => assets.id),
		taxCode: text("tax_code").default("standard").notNull(),
		createdAt: now(),
		updatedAt: updatedNow()
	},
	(table) => [
		uniqueIndex("categories_slug_idx").on(table.slug),
		index("categories_parent_idx").on(table.parentId)
	]
);

export const categoryTranslations = sqliteTable(
	"category_translations",
	{
		id: pk(),
		categoryId: integer("category_id")
			.references(() => categories.id, { onDelete: "cascade" })
			.notNull(),
		languageCode: text("language_code").notNull(),
		name: text("name").notNull()
	},
	(table) => [
		uniqueIndex("category_translations_category_lang_idx").on(
			table.categoryId,
			table.languageCode
		)
	]
);

export const productCategories = sqliteTable(
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

export const relatedProducts = sqliteTable(
	"related_products",
	{
		productId: integer("product_id")
			.references(() => products.id, { onDelete: "cascade" })
			.notNull(),
		relatedProductId: integer("related_product_id")
			.references(() => products.id, { onDelete: "cascade" })
			.notNull(),
		position: integer("position").default(0).notNull(),
		createdAt: now()
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

export const reviews = sqliteTable(
	"reviews",
	{
		id: pk(),
		productId: integer("product_id")
			.references(() => products.id, { onDelete: "cascade" })
			.notNull(),
		customerId: integer("customer_id")
			.references(() => customers.id, { onDelete: "cascade" })
			.notNull(),
		nickname: text("nickname").notNull(),
		rating: integer("rating").notNull(),
		comment: text("comment"),
		isVerifiedPurchase: bool("is_verified_purchase").default(false).notNull(),
		status: text("status", { enum: ["pending", "approved", "rejected"] })
			.default("pending")
			.notNull(),
		createdAt: now(),
		updatedAt: updatedNow()
	},
	(table) => [
		index("reviews_product_idx").on(table.productId),
		index("reviews_customer_idx").on(table.customerId),
		index("reviews_status_idx").on(table.status),
		uniqueIndex("reviews_product_customer_idx").on(table.productId, table.customerId)
	]
);

// ============================================================================
// CONTENT PAGES
// ============================================================================

export const contentPages = sqliteTable("content_pages", {
	id: pk(),
	title: text("title").default("").notNull(),
	slug: text("slug").default("").notNull(),
	body: text("body"),
	imageUrl: text("image_url"),
	published: bool("published").default(false).notNull(),
	createdAt: now(),
	updatedAt: updatedNow()
});

export const contentPageTranslations = sqliteTable(
	"content_page_translations",
	{
		id: pk(),
		contentPageId: integer("content_page_id")
			.references(() => contentPages.id, { onDelete: "cascade" })
			.notNull(),
		languageCode: text("language_code").notNull(),
		title: text("title").notNull(),
		slug: text("slug").notNull(),
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

// ============================================================================
// OUTBOX (background jobs / integrations)
// A durable event log drained by a scheduled "tick" (CF cron / Node interval).
// Producers INSERT rows via emitEvent; the runner processes them with retry.
// ============================================================================

export const outbox = sqliteTable(
	"outbox",
	{
		id: pk(),
		type: text("type").notNull(),
		payload: text("payload", { mode: "json" }),
		status: text("status", { enum: ["pending", "done", "failed"] })
			.default("pending")
			.notNull(),
		attempts: integer("attempts").default(0).notNull(),
		maxAttempts: integer("max_attempts").default(5).notNull(),
		nextAttemptAt: ts("next_attempt_at").notNull(),
		lastError: text("last_error"),
		createdAt: now(),
		updatedAt: updatedNow()
	},
	(table) => [
		// The runner's hot query: pending rows whose backoff has elapsed
		index("outbox_due_idx").on(table.status, table.nextAttemptAt)
	]
);
