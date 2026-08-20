/**
 * Structured-data builders for <svelte:head>.
 */
import { stripHtml } from "$lib/utils";
import type { ProductWithRelations } from "$lib/types";

/**
 * Escape a JSON payload for embedding inside a <script> block. Product names
 * and descriptions are store-authored, but they still must not be able to
 * close the script element (or open an HTML comment) and turn structured data
 * into executable markup.
 */
function escapeJsonForScript(json: string): string {
	return json
		.replaceAll("<", "\\u003c")
		.replaceAll(">", "\\u003e")
		.replaceAll("&", "\\u0026")
		.replaceAll("\u2028", "\\u2028")
		.replaceAll("\u2029", "\\u2029");
}

/**
 * schema.org Product JSON-LD as a complete <script> tag string (rendered
 * with {@html}). Built as a string because a template literal containing
 * "<script>" in Svelte markup breaks the eslint Svelte parser.
 */
export function productJsonLd(
	product: ProductWithRelations,
	rating: { average: number; count: number }
): string {
	return `<script type="application/ld+json">${escapeJsonForScript(
		JSON.stringify({
			"@context": "https://schema.org",
			"@type": "Product",
			name: product.name,
			description: stripHtml(product.description),
			image: product.featuredAsset?.source,
			sku: product.variants[0]?.sku,
			offers: {
				"@type": "AggregateOffer",
				priceCurrency: "EUR",
				lowPrice: (Math.min(...product.variants.map((v) => v.price)) / 100).toFixed(2),
				highPrice: (Math.max(...product.variants.map((v) => v.price)) / 100).toFixed(2),
				offerCount: product.variants.length,
				availability: product.variants.some((v) => !v.trackInventory || v.stock > 0)
					? "https://schema.org/InStock"
					: "https://schema.org/OutOfStock"
			},
			...(rating.count > 0
				? {
						aggregateRating: {
							"@type": "AggregateRating",
							ratingValue: rating.average.toFixed(1),
							reviewCount: rating.count
						}
					}
				: {})
		})
	)}${"</scr" + "ipt>"}`;
}
