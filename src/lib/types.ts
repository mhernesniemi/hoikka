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
	orderPromotions,
	shippingMethods,
	orderShipping,
	collections,
	collectionTranslations,
	collectionFilters,
	wishlists,
	wishlistItems,
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
export type NewProduct = InferInsertModel<typeof products>;

export type ProductTranslation = InferSelectModel<typeof productTranslations>;
export type NewProductTranslation = InferInsertModel<typeof productTranslations>;

export type ProductVariant = InferSelectModel<typeof productVariants>;
export type NewProductVariant = InferInsertModel<typeof productVariants>;

export type ProductVariantTranslation = InferSelectModel<typeof productVariantTranslations>;
export type NewProductVariantTranslation = InferInsertModel<typeof productVariantTranslations>;

export type ProductVariantGroupPrice = InferSelectModel<typeof productVariantGroupPrices>;
export type NewProductVariantGroupPrice = InferInsertModel<typeof productVariantGroupPrices>;

/** Product visibility - derived from schema enum */
export type ProductVisibility = Product["visibility"];

/** Product type - physical or digital */
export type ProductType = Product["type"];

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
export type NewFacet = InferInsertModel<typeof facets>;

export type FacetTranslation = InferSelectModel<typeof facetTranslations>;
export type NewFacetTranslation = InferInsertModel<typeof facetTranslations>;

export type FacetValue = InferSelectModel<typeof facetValues>;
export type NewFacetValue = InferInsertModel<typeof facetValues>;

export type FacetValueTranslation = InferSelectModel<typeof facetValueTranslations>;
export type NewFacetValueTranslation = InferInsertModel<typeof facetValueTranslations>;

/** Facet with all values */
export interface FacetWithValues extends Facet {
	values: FacetValue[];
}

// ============================================================================
// ASSET TYPES
// ============================================================================

export type Asset = InferSelectModel<typeof assets>;
export type NewAsset = InferInsertModel<typeof assets>;

/** Asset type - derived from schema enum */
export type AssetType = Asset["type"];

// ============================================================================
// CUSTOMER GROUPS (B2B)
// ============================================================================

export type CustomerGroup = InferSelectModel<typeof customerGroups>;
export type NewCustomerGroup = InferInsertModel<typeof customerGroups>;

export type CustomerGroupMember = InferSelectModel<typeof customerGroupMembers>;
export type NewCustomerGroupMember = InferInsertModel<typeof customerGroupMembers>;

// ============================================================================
// CUSTOMER TYPES
// ============================================================================

export type Customer = InferSelectModel<typeof customers>;
export type NewCustomer = InferInsertModel<typeof customers>;

export type Address = InferSelectModel<typeof addresses>;
export type NewAddress = InferInsertModel<typeof addresses>;

/** Customer with addresses */
export interface CustomerWithAddresses extends Customer {
	addresses: Address[];
}

/** Customer with groups */
export interface CustomerWithGroups extends Customer {
	groups: CustomerGroup[];
}

// ============================================================================
// ORDER TYPES
// ============================================================================

export type Order = InferSelectModel<typeof orders>;
export type NewOrder = InferInsertModel<typeof orders>;

export type OrderLine = InferSelectModel<typeof orderLines>;
export type NewOrderLine = InferInsertModel<typeof orderLines>;

export type Payment = InferSelectModel<typeof payments>;
export type NewPayment = InferInsertModel<typeof payments>;

export type PaymentMethod = InferSelectModel<typeof paymentMethods>;
export type NewPaymentMethod = InferInsertModel<typeof paymentMethods>;

/** Payment with method details */
export interface PaymentWithMethod extends Payment {
	paymentMethod: PaymentMethod;
}

/** Order state - derived from schema enum */
export type OrderState = Order["state"];

/** Payment state - derived from schema enum */
export type PaymentState = Payment["state"];

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

export type StockReservation = InferSelectModel<typeof stockReservations>;
export type NewStockReservation = InferInsertModel<typeof stockReservations>;

// ============================================================================
// TAX RATE TYPES
// ============================================================================

export type TaxRate = InferSelectModel<typeof taxRates>;
export type NewTaxRate = InferInsertModel<typeof taxRates>;

/** Tax code - common codes */
export type TaxCode = "standard" | "food" | "books" | "zero";

// ============================================================================
// PROMOTION TYPES
// ============================================================================

export type Promotion = InferSelectModel<typeof promotions>;
export type NewPromotion = InferInsertModel<typeof promotions>;

export type PromotionProduct = InferSelectModel<typeof promotionProducts>;
export type PromotionCollection = InferSelectModel<typeof promotionCollections>;

export type OrderPromotion = InferSelectModel<typeof orderPromotions>;

/** Discount type - derived from schema enum */
export type DiscountType = Promotion["discountType"];

/** Promotion method - code or automatic */
export type PromotionMethod = Promotion["method"];

/** Promotion type - order, product, or free_shipping */
export type PromotionType = Promotion["promotionType"];

/** Promotion applies to - all, specific_products, or specific_collections */
export type PromotionAppliesTo = Promotion["appliesTo"];

/** Order promotion type - order, product, or shipping */
export type OrderPromotionType = OrderPromotion["type"];

/** Promotion with related products and collections */
export interface PromotionWithRelations extends Promotion {
	products: { productId: number; productName?: string }[];
	collections: { collectionId: number; collectionName?: string }[];
}

// ============================================================================
// SHIPPING TYPES
// ============================================================================

export type ShippingMethod = InferSelectModel<typeof shippingMethods>;
export type NewShippingMethod = InferInsertModel<typeof shippingMethods>;

export type OrderShipping = InferSelectModel<typeof orderShipping>;
export type NewOrderShipping = InferInsertModel<typeof orderShipping>;

/** Shipping status - derived from schema enum */
export type ShippingStatus = OrderShipping["status"];

/** Order with shipping info */
export interface OrderWithShipping extends Omit<OrderWithRelations, "shipping"> {
	shipping?: OrderShippingWithMethod | null;
}

/** Order shipping with method details */
export interface OrderShippingWithMethod extends OrderShipping {
	shippingMethod: ShippingMethod;
}

// ============================================================================
// COLLECTION TYPES (Smart Collections - Vendure/Shopify style)
// ============================================================================

export type Collection = InferSelectModel<typeof collections>;
export type NewCollection = InferInsertModel<typeof collections>;

export type CollectionTranslation = InferSelectModel<typeof collectionTranslations>;
export type NewCollectionTranslation = InferInsertModel<typeof collectionTranslations>;

export type CollectionFilter = InferSelectModel<typeof collectionFilters>;
export type NewCollectionFilter = InferInsertModel<typeof collectionFilters>;

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

export type Wishlist = InferSelectModel<typeof wishlists>;
export type NewWishlist = InferInsertModel<typeof wishlists>;

export type WishlistItem = InferSelectModel<typeof wishlistItems>;
export type NewWishlistItem = InferInsertModel<typeof wishlistItems>;

// ============================================================================
// REVIEW TYPES
// ============================================================================

export type Review = InferSelectModel<typeof reviews>;
export type NewReview = InferInsertModel<typeof reviews>;

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
export type NewContentPage = InferInsertModel<typeof contentPages>;

export type ContentPageTranslation = InferSelectModel<typeof contentPageTranslations>;
export type NewContentPageTranslation = InferInsertModel<typeof contentPageTranslations>;

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
}

export interface CreateOrderInput {
	customerId?: number;
	currencyCode?: string;
}

export interface AddOrderLineInput {
	variantId: number;
	quantity: number;
}

export interface CreateCustomerInput {
	clerkUserId?: string;
	email: string;
	firstName: string;
	lastName: string;
	phone?: string;
	isAdmin?: boolean;
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
}

export interface AddCollectionFilterInput {
	collectionId: number;
	field: CollectionFilterField;
	operator: CollectionFilterOperator;
	value: unknown;
}

export interface CreateReviewInput {
	productId: number;
	customerId: number;
	nickname: string;
	rating: number;
	comment?: string;
}
