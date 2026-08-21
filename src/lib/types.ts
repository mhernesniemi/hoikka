/**
 * TypeScript types for the commerce platform
 * These types are inferred from the Drizzle schema for end-to-end type safety
 */
import type { InferSelectModel, InferInsertModel } from "drizzle-orm";
import type {
	products,
	productTranslations,
	productVariants,
	productVariantTranslations,
	productVariantGroupPrices,
	facets,
	facetTranslations,
	facetValues,
	facetValueTranslations,
	assets,
	customerGroups,
	customerGroupMembers,
	customers,
	addresses,
	orders,
	orderLines,
	payments,
	paymentMethods,
	promotions,
	promotionProducts,
	promotionCollections,
	shippingMethods,
	orderShipping,
	collections,
	collectionTranslations,
	collectionFilters,
	reviews,
	stockReservations,
	taxRates,
	contentPages,
	contentPageTranslations
} from "$lib/server/db/schema.js";

// ============================================================================
// PRODUCT TYPES
// ============================================================================

export type Product = InferSelectModel<typeof products>;
export type ProductVariant = InferSelectModel<typeof productVariants>;
/** Product visibility - derived from schema enum */
export type ProductVisibility = Product["visibility"];

/** Product type - physical or digital */
export type ProductType = Product["type"];

/** Lightweight product for admin list views */
export interface ProductListItem {
	id: number;
	name: string;
	visibility: string;
	createdAt: Date;
	variantCount: number;
	featuredAssetSource: string | null;
}

/** Lightweight collection for admin list views */
export interface CollectionListItem {
	id: number;
	name: string;
	isPrivate: boolean;
	createdAt: Date;
	productCount: number;
}

/** Lightweight facet for admin list views */
export interface FacetListItem {
	id: number;
	name: string;
	code: string;
	valueCount: number;
}

/** Lightweight customer group for admin list views */
export interface CustomerGroupListItem {
	id: number;
	name: string;
	description: string | null;
	createdAt: Date;
	customerCount: number;
}

/** Lightweight product for client-side cache (from product_search table) */
export interface CachedProduct {
	id: number;
	name: string;
	slug: string;
	description: string | null;
	minPrice: number | null;
	maxPrice: number | null;
	inStock: boolean;
	featuredAsset: { source: string; focalX: number; focalY: number } | null;
	facets: Record<string, { code: string; name: string; facetValueId: number }[]>;
	variantFacetImages: Record<string, Record<string, string>> | null;
}

/** Product with all related data */
export interface ProductWithRelations extends Product {
	variants: ProductVariantWithRelations[];
	facetValues: FacetValue[];
	assets: Asset[];
	featuredAsset?: Asset | null;
}

/** Variant with all related data */
export interface ProductVariantWithRelations extends ProductVariant {
	facetValues: FacetValue[];
	assets: Asset[];
	featuredAsset?: Asset | null;
	effectivePrice?: number;
}

// ============================================================================
// FACET TYPES
// ============================================================================

export type Facet = InferSelectModel<typeof facets>;
export type FacetValue = InferSelectModel<typeof facetValues>;
/** Facet with all values */
export interface FacetWithValues extends Facet {
	values: FacetValue[];
}

// ============================================================================
// ASSET TYPES
// ============================================================================

export type Asset = InferSelectModel<typeof assets>;
// ============================================================================
// CUSTOMER GROUPS (B2B)
// ============================================================================

export type CustomerGroup = InferSelectModel<typeof customerGroups>;
export type NewCustomerGroup = InferInsertModel<typeof customerGroups>;

// ============================================================================
// CUSTOMER TYPES
// ============================================================================

export type Customer = InferSelectModel<typeof customers>;
export type Address = InferSelectModel<typeof addresses>;
/** Customer with addresses */
export interface CustomerWithAddresses extends Customer {
	addresses: Address[];
}

// ============================================================================
// ORDER TYPES
// ============================================================================

export type Order = InferSelectModel<typeof orders>;
export type OrderLine = InferSelectModel<typeof orderLines>;
export type Payment = InferSelectModel<typeof payments>;
export type NewPayment = InferInsertModel<typeof payments>;

export type PaymentMethod = InferSelectModel<typeof paymentMethods>;
/** Order state - derived from schema enum */
export type OrderState = Order["state"];

/** Lightweight order for admin list views */
export interface OrderListItem {
	id: number;
	code: string;
	state: string;
	total: number;
	currencyCode: string;
	shippingFullName: string | null;
	orderPlacedAt: Date | null;
	createdAt: Date;
	/** Total units ordered (sum of line quantities), matching the storefront's item count */
	itemCount: number;
}

/** Order with all related data */
export interface OrderWithRelations extends Order {
	lines: OrderLineWithVariant[];
	payments: Payment[];
	customer?: Customer | null;
}

/** Order line with variant info */
export interface OrderLineWithVariant extends OrderLine {
	variant?: ProductVariant | null;
	imageUrl?: string | null;
	productId?: number | null;
}

// ============================================================================
// STOCK RESERVATION TYPES
// ============================================================================

// ============================================================================
// TAX RATE TYPES
// ============================================================================

// ============================================================================
// PROMOTION TYPES
// ============================================================================

export type Promotion = InferSelectModel<typeof promotions>;

/** Discount type - derived from schema enum */
export type DiscountType = Promotion["discountType"];

/** Promotion type - order, product, or free_shipping */
export type PromotionType = Promotion["promotionType"];

/** Promotion applies to - all, specific_products, or specific_collections */
export type PromotionAppliesTo = Promotion["appliesTo"];

/** Promotion with related products and collections */
export interface PromotionWithRelations extends Promotion {
	products: { productId: number; productName?: string }[];
	collections: { collectionId: number; collectionName?: string }[];
}

// ============================================================================
// SHIPPING TYPES
// ============================================================================

export type ShippingMethod = InferSelectModel<typeof shippingMethods>;
export type OrderShipping = InferSelectModel<typeof orderShipping>;
export type NewOrderShipping = InferInsertModel<typeof orderShipping>;

// ============================================================================
// COLLECTION TYPES (Smart Collections - Vendure/Shopify style)
// ============================================================================

export type Collection = InferSelectModel<typeof collections>;
export type CollectionFilter = InferSelectModel<typeof collectionFilters>;
/** Collection filter field - derived from schema enum */
export type CollectionFilterField = CollectionFilter["field"];

/** Collection filter operator - derived from schema enum */
export type CollectionFilterOperator = CollectionFilter["operator"];

/** Collection with all related data */
export interface CollectionWithRelations extends Collection {
	filters: CollectionFilter[];
	featuredAsset?: Asset | null;
}

// ============================================================================
// WISHLIST TYPES
// ============================================================================

// ============================================================================
// REVIEW TYPES
// ============================================================================

export type Review = InferSelectModel<typeof reviews>;
/** Review status - derived from schema enum */
export type ReviewStatus = Review["status"];

/** Review with customer info */
export interface ReviewWithCustomer extends Review {
	customer: Customer;
}

/** Review with product and customer info (for admin) */
export interface ReviewWithRelations extends Review {
	product: Product;
	customer: Customer;
}

// ============================================================================
// CONTENT PAGE TYPES
// ============================================================================

export type ContentPage = InferSelectModel<typeof contentPages>;
// ============================================================================
// SORT TYPES
// ============================================================================

export type ProductSortKey = "newest" | "price-asc" | "price-desc" | "name-asc" | "name-desc";

export const PRODUCT_SORT_OPTIONS: { value: ProductSortKey; label: string }[] = [
	{ value: "newest", label: "Newest" },
	{ value: "price-asc", label: "Price: Low to High" },
	{ value: "price-desc", label: "Price: High to Low" },
	{ value: "name-asc", label: "Name: A–Z" },
	{ value: "name-desc", label: "Name: Z–A" }
];

// ============================================================================
// FILTER & QUERY TYPES
// ============================================================================

/** Facet filter for product queries */
export interface FacetFilter {
	[facetCode: string]: string[]; // e.g., { color: ['red', 'blue'], size: ['M', 'L'] }
}

/** Product list options */
export interface ProductListOptions {
	facets?: FacetFilter;
	search?: string;
	visibility?: ProductVisibility | ProductVisibility[];
	limit?: number;
	offset?: number;
}

/** Facet count result */
export interface FacetCount {
	facetCode: string;
	valueCode: string;
	valueName: string;
	count: number;
}

/** Pagination info */
export interface PaginationInfo {
	total: number;
	limit: number;
	offset: number;
	hasMore: boolean;
}

/** Paginated result */
export interface PaginatedResult<T> {
	items: T[];
	pagination: PaginationInfo;
}

// ============================================================================
// INPUT TYPES (for service methods)
// ============================================================================

export interface CreateProductInput {
	type?: ProductType;
	visibility?: ProductVisibility;
	taxCode?: string;
	name: string;
	slug: string;
	description?: string;
}

export interface UpdateProductInput {
	type?: ProductType;
	visibility?: ProductVisibility;
	taxCode?: string;
	name?: string;
	slug?: string;
	description?: string;
	customFields?: Record<string, unknown>;
}

export interface CreateVariantInput {
	productId: number;
	sku: string;
	price: number;
	stock?: number;
	trackInventory?: boolean;
	name?: string;
	imageUrl?: string | null;
}

export interface UpdateVariantInput {
	sku?: string;
	price?: number;
	stock?: number;
	trackInventory?: boolean;
	name?: string;
	imageUrl?: string | null;
	isFeatured?: boolean;
}

export interface CreateOrderInput {
	customerId?: number;
	currencyCode?: string;
}

export interface CreateCustomerInput {
	authUserId?: string;
	email: string;
	firstName: string;
	lastName: string;
	phone?: string;
}

export interface CreatePromotionInput {
	method?: "code" | "automatic";
	code?: string;
	title?: string;
	promotionType?: PromotionType;
	discountType: DiscountType;
	discountValue: number;
	appliesTo?: PromotionAppliesTo;
	minOrderAmount?: number;
	usageLimit?: number;
	usageLimitPerCustomer?: number;
	combinesWithOtherPromotions?: boolean;
	customerGroupId?: number | null;
	startsAt?: Date;
	endsAt?: Date;
	productIds?: number[];
	collectionIds?: number[];
}

export interface UpdatePromotionInput {
	title?: string | null;
	discountType?: DiscountType;
	discountValue?: number;
	appliesTo?: PromotionAppliesTo;
	minOrderAmount?: number | null;
	usageLimit?: number | null;
	usageLimitPerCustomer?: number | null;
	combinesWithOtherPromotions?: boolean;
	customerGroupId?: number | null;
	enabled?: boolean;
	startsAt?: Date | null;
	endsAt?: Date | null;
	productIds?: number[];
	collectionIds?: number[];
}

export interface CreateCollectionInput {
	isPrivate?: boolean;
	position?: number;
	featuredAssetId?: number;
	name: string;
	slug: string;
	description?: string;
	filters?: {
		field: CollectionFilterField;
		operator: CollectionFilterOperator;
		value: unknown;
	}[];
}

export interface UpdateCollectionInput {
	isPrivate?: boolean;
	position?: number;
	featuredAssetId?: number | null;
	name?: string;
	slug?: string;
	description?: string;
	customFields?: Record<string, unknown>;
}

export interface CreateReviewInput {
	productId: number;
	customerId: number;
	nickname: string;
	rating: number;
	comment?: string;
}
