/**
 * Remote-function bindings — project-owned. SvelteKit's experimental
 * remote functions must live in the app's own .remote.ts files, so this
 * wrapper binds the handlers from @hoikka/core; the logic lives there.
 */
import { query, command } from "$app/server";
import * as remote from "@hoikka/core/remote/checkout";

export const getCheckout = query(remote.getCheckout);

const handlers = remote.commands(() => getCheckout().refresh());
export const setShippingAddress = command(
	remote.schemas.setShippingAddress,
	handlers.setShippingAddress
);
export const useSavedAddress = command(remote.schemas.useSavedAddress, handlers.useSavedAddress);
export const setContactInfo = command(remote.schemas.setContactInfo, handlers.setContactInfo);
export const setShippingMethod = command(
	remote.schemas.setShippingMethod,
	handlers.setShippingMethod
);
export const applyPromotion = command(remote.schemas.applyPromotion, handlers.applyPromotion);
export const removePromotion = command(handlers.removePromotion);
export const createPayment = command(remote.schemas.createPayment, handlers.createPayment);
export const completeOrder = command(remote.schemas.completeOrder, handlers.completeOrder);

export type { CheckoutPaymentInfo } from "@hoikka/core/remote/checkout";
