/**
 * Product gallery image helpers — kept out of the page component so the
 * .svelte files stay composition-only.
 */
import { imageUrl, imageSrcset } from "@hoikka/core/shared/image";
import type { ProductWithRelations } from "@hoikka/core/shared/types";

type GalleryImage = ProductWithRelations["assets"][number];

/** The hero image's rendered geometry — preload, <Img> and cache warming
 *  must all agree on it so they resolve to the same file */
export const HERO_WIDTH = 600;
export const HERO_SIZES = "(max-width: 1024px) 100vw, 600px";

/** Stable gallery list: product assets, then unique variant images */
export function galleryImages(product: ProductWithRelations): GalleryImage[] {
	const productImages =
		product.assets.length > 0
			? product.assets
			: product.featuredAsset
				? [product.featuredAsset]
				: [];

	const seen = new Set(productImages.map((img) => img.source));
	const variantImages: GalleryImage[] = [];

	for (const variant of product.variants) {
		if (!variant.imageUrl || seen.has(variant.imageUrl)) continue;
		seen.add(variant.imageUrl);
		variantImages.push({
			id: -variant.id,
			name: variant.name || variant.sku,
			type: "image",
			mimeType: "image/jpeg",
			width: 0,
			height: 0,
			fileSize: 0,
			source: variant.imageUrl,
			alt: null,
			focalX: 0.5,
			focalY: 0.5,
			createdAt: new Date()
		});
	}

	return [...productImages, ...variantImages];
}

/**
 * Warm the gallery at hero size once the browser is idle, so switching
 * variants swaps images from memory cache instead of fetching on click.
 * Returns a cleanup function (for use inside an $effect).
 */
export function warmGalleryImages(images: GalleryImage[]): () => void {
	const warm = () => {
		for (const image of images.slice(0, 8)) {
			const el = new Image();
			el.sizes = HERO_SIZES;
			el.srcset = imageSrcset(image.source, HERO_WIDTH) ?? "";
			el.src = imageUrl(image.source, HERO_WIDTH);
		}
	};
	if ("requestIdleCallback" in window) {
		const handle = requestIdleCallback(warm);
		return () => cancelIdleCallback(handle);
	}
	const timer = setTimeout(warm, 400);
	return () => clearTimeout(timer);
}
