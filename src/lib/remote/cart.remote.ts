/**
 * Remote-function bindings — project-owned. SvelteKit's experimental
 * remote functions must live in the app's own .remote.ts files, so this
 * wrapper binds the handlers from @hoikka/core; the logic lives there.
 */
import { query, command } from "$app/server";
import * as remote from "@hoikka/core/remote/cart";

export const getCart = query(remote.getCart);

const handlers = remote.commands(() => getCart().refresh());
export const addToCart = command(remote.schemas.addToCart, handlers.addToCart);
export const setCartQuantity = command(remote.schemas.setCartQuantity, handlers.setCartQuantity);
export const removeCartLine = command(remote.schemas.removeCartLine, handlers.removeCartLine);
