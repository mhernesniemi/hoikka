/**
 * Product page data loader — composes everything the storefront product page
 * needs from the individual services. Lives in the service layer so the route
 * stays a thin controller and the query orchestration is kept in one place:
 * every fetch depends only on the product id, so they all run in parallel
 * (each awaited stage is a network round trip on D1).
 *
 * HTTP concerns stay in the route: `product` is null when not found and the
 * caller decides how to respond.
 */
import { productService, stampGroupPrices } from "./products.js";
import { reviewService } from "./reviews.js";
import { categoryService } from "./categories.js";
import { relatedProductService } from "./related-products.js";

export async function loadProductPageData(productId: number, customerId: number | null) {
	const [product, rating, reviewsResult, customerReview, breadcrumbs, relatedProducts] =
		await Promise.all([
			productService.getById(productId),
			reviewService.getProductRating(productId),
			reviewService.getProductReviews(productId, { limit: 10 }),
			customerId ? reviewService.getCustomerReviewForProduct(customerId, productId) : null,
			// Breadcrumbs for the first category (primary category path)
			categoryService
				.getProductCategories(productId)
				.then((cats) =>
					cats.length > 0 ? categoryService.getBreadcrumbs(cats[0].id) : []
				),
			relatedProductService.getRelatedProducts(productId, 8)
		]);

	if (product) {
		await stampGroupPrices([product, ...relatedProducts], customerId);
	}

	return { product, rating, reviewsResult, customerReview, breadcrumbs, relatedProducts };
}
