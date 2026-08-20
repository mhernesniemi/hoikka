import { describe, it, expect } from "vitest";
import { productJsonLd } from "./seo.js";
import type { ProductWithRelations } from "./types.js";

function makeProduct(overrides: Partial<ProductWithRelations> = {}): ProductWithRelations {
	return {
		id: 1,
		name: "Nordic Chair",
		slug: "nordic-chair",
		description: "A chair",
		type: "physical",
		visibility: "public",
		taxCode: "standard",
		featuredAssetId: null,
		digitalAssetId: null,
		deletedAt: null,
		createdAt: new Date(),
		updatedAt: new Date(),
		variants: [
			{
				id: 1,
				productId: 1,
				name: null,
				sku: "CHAIR-1",
				price: 9900,
				stock: 3,
				trackInventory: true,
				featuredAssetId: null,
				imageUrl: null,
				isFeatured: false,
				deletedAt: null,
				createdAt: new Date(),
				updatedAt: new Date(),
				facetValues: [],
				assets: [],
				featuredAsset: null
			}
		],
		facetValues: [],
		assets: [],
		featuredAsset: null,
		...overrides
	} as ProductWithRelations;
}

describe("productJsonLd", () => {
	const rating = { average: 0, count: 0 };

	it("emits a JSON-LD script tag", () => {
		const html = productJsonLd(makeProduct(), rating);
		expect(html.startsWith('<script type="application/ld+json">')).toBe(true);
		expect(html.endsWith("</script>")).toBe(true);
	});

	it("cannot be escaped by a product name that closes the script block", () => {
		const html = productJsonLd(
			makeProduct({ name: "</script><script>alert(1)</script>" }),
			rating
		);
		// Exactly one opening and one closing tag — the payload stayed inside.
		expect(html.match(/<script/g)).toHaveLength(1);
		expect(html.match(/<\/script>/g)).toHaveLength(1);
		expect(html).toContain("\\u003c");
	});

	it("keeps the escaped payload parseable as JSON", () => {
		const html = productJsonLd(makeProduct({ name: "Chair <b>&</b>" }), rating);
		const body = html.slice(html.indexOf(">") + 1, html.lastIndexOf("</script>"));
		expect(JSON.parse(body).name).toBe("Chair <b>&</b>");
	});
});
