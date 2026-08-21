/**
 * Remote-function bindings — project-owned. SvelteKit's experimental
 * remote functions must live in the app's own .remote.ts files, so this
 * wrapper binds the handlers from @hoikka/core; the logic lives there.
 */
import { query, command } from "$app/server";
import * as remote from "@hoikka/core/remote/wishlist";

export const getWishlistCount = query(remote.getWishlistCount);
export const isProductWishlisted = query(
	remote.isProductWishlistedSchema,
	remote.isProductWishlisted
);

const handlers = remote.commands(() => getWishlistCount().refresh());
export const toggleWishlist = command(remote.schemas.toggleWishlist, handlers.toggleWishlist);
