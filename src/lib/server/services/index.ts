/**
 * Services index
 * Re-exports all service instances for convenient access
 */
export { productService, ProductService } from "./products.js";
export { orderService, OrderService } from "./orders.js";
export { customerService, CustomerService } from "./customers.js";
export { facetService, FacetService } from "./facets.js";
export { promotionService, PromotionService } from "./promotions.js";
export { paymentService, PaymentService, isPaymentSuccessful } from "./payments/index.js";
export { shippingService, ShippingService } from "./shipping/index.js";
export { wishlistService, WishlistService } from "./wishlist.js";
export { reviewService, ReviewService } from "./reviews.js";
export { authService } from "./auth.js";
export type { User, Session } from "./auth.js";
export { categoryService, CategoryService } from "./categories.js";
export type { Category, CategoryTreeNode, CategoryBreadcrumb } from "./categories.js";
export { contentPageService, ContentPageService } from "./content-pages.js";
export { translationService, TranslationService } from "./translations.js";
export { relatedProductService, RelatedProductService } from "./related-products.js";
