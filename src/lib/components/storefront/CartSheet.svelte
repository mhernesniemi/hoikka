<script lang="ts">
  import { invalidateAll, goto } from "$app/navigation";
  import { page } from "$app/state";
  import { getCart, setCartQuantity, removeCartLine } from "$lib/remote/cart.remote";
  import { getCheckout } from "$lib/remote/checkout.remote";
  import Img from "$lib/components/storefront/Img.svelte";
  import { cartStore } from "$lib/stores/cart.svelte";
  import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetFooter
  } from "$lib/components/storefront/ui/sheet";
  import { Button, buttonVariants } from "$lib/components/storefront/ui/button";
  import ShoppingCart from "@lucide/svelte/icons/shopping-cart";
  import Minus from "@lucide/svelte/icons/minus";
  import Plus from "@lucide/svelte/icons/plus";
  import Trash2 from "@lucide/svelte/icons/trash-2";
  import LoaderCircle from "@lucide/svelte/icons/loader-circle";

  // Fallback badge count for first paint, before the cart query resolves
  let { initialItemCount = 0 }: { initialItemCount?: number } = $props();

  const cartQuery = getCart();
  const cart = $derived(cartQuery.current);
  const lines = $derived(cart?.lines ?? []);
  const itemCount = $derived(cart?.itemCount ?? initialItemCount);
  const isLoading = $derived(!cart && cartQuery.loading);

  let pendingMutations = $state(0);
  const isUpdating = $derived(pendingMutations > 0);

  function formatPrice(cents: number): string {
    return (cents / 100).toFixed(2);
  }

  const isOnCheckout = $derived(page.url.pathname === "/checkout");

  async function mutate(action: () => Promise<unknown>) {
    pendingMutations++;
    try {
      await action();
    } catch {
      // The refreshed cart query is authoritative either way
    } finally {
      pendingMutations--;
    }
    if (isOnCheckout) {
      // The checkout draft order is rebuilt from the cookie on load, then the
      // checkout query must be refetched to pick up the reconciled draft
      await invalidateAll();
      await getCheckout().refresh();
      if ((cartQuery.current?.itemCount ?? 0) === 0) {
        cartStore.close();
        goto("/products");
      }
    }
  }

  const updateQuantity = (variantId: number, quantity: number) =>
    mutate(() => setCartQuantity({ variantId, quantity }));
  const removeLine = (variantId: number) => mutate(() => removeCartLine({ variantId }));
</script>

<Sheet
  open={cartStore.isOpen}
  onOpenChange={(open) => (open ? cartStore.open() : cartStore.close())}
>
  <button
    type="button"
    onclick={() => cartStore.open()}
    class="relative"
    aria-label="Shopping cart"
  >
    <ShoppingCart class="h-6 w-6" />
    {#if itemCount > 0}
      <span
        class="absolute -top-2 -right-2 flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-xs text-white"
      >
        {itemCount > 99 ? "99+" : itemCount}
      </span>
    {/if}
  </button>

  <SheetContent side="right" class="flex w-full flex-col sm:max-w-md">
    <SheetHeader class="pb-4">
      <SheetTitle class="text-xl">Shopping Cart</SheetTitle>
    </SheetHeader>

    <div class="flex-1 overflow-y-auto py-4">
      {#if isLoading}
        <div class="divide-y divide-gray-200">
          {#each [1, 2] as _ (_)}
            <div class="flex gap-3 p-3">
              <div class="h-20 w-20 shrink-0 animate-pulse rounded-md bg-gray-200"></div>
              <div class="flex min-w-0 flex-1 flex-col">
                <div class="flex items-start justify-between gap-2">
                  <div class="space-y-2">
                    <div class="h-4 w-32 animate-pulse rounded bg-gray-200"></div>
                    <div class="h-3 w-20 animate-pulse rounded bg-gray-200"></div>
                  </div>
                </div>
                <div class="mt-auto flex items-center justify-between pt-2">
                  <div class="h-7 w-20 animate-pulse rounded bg-gray-200"></div>
                  <div class="h-4 w-16 animate-pulse rounded bg-gray-200"></div>
                </div>
              </div>
            </div>
          {/each}
        </div>
      {:else if lines.length === 0}
        <div class="flex flex-col items-center justify-center py-16 text-center">
          <div class="mb-4 rounded-full bg-gray-100 p-4">
            <ShoppingCart class="h-10 w-10 text-gray-400" />
          </div>
          <p class="mb-1 font-medium text-gray-900">Your cart is empty</p>
          <p class="mb-6 text-sm text-gray-500">Add some items to get started</p>
          <Button onclick={() => cartStore.close()}>Continue Shopping</Button>
        </div>
      {:else}
        <div class="divide-y divide-gray-200">
          {#each lines as line (line.variantId)}
            <div class="flex gap-3 p-3" class:opacity-60={line.outOfStock}>
              <div class="h-20 w-20 shrink-0 overflow-hidden rounded-md bg-gray-100">
                {#if line.imageUrl}
                  <Img
                    src={line.imageUrl}
                    alt={line.productName}
                    width={100}
                    class="h-full w-full object-cover"
                  />
                {:else}
                  <div class="flex h-full w-full items-center justify-center">
                    <ShoppingCart class="h-6 w-6 text-gray-300" />
                  </div>
                {/if}
              </div>

              <div class="flex min-w-0 flex-1 flex-col">
                <div class="flex items-start justify-between gap-2">
                  <div class="min-w-0">
                    <h4 class="truncate text-sm font-medium text-gray-900">
                      <a
                        href="/products/{line.productId}"
                        onclick={() => cartStore.close()}
                        class="hover:underline">{line.productName || "Untitled product"}</a
                      >
                    </h4>
                    {#if line.variantName}
                      <p class="text-xs text-gray-500">{line.variantName}</p>
                    {/if}
                    {#if line.outOfStock}
                      <p class="text-xs text-red-600">Out of stock</p>
                    {/if}
                  </div>
                  <button
                    type="button"
                    onclick={() => removeLine(line.variantId)}
                    class="rounded p-1 text-gray-400 transition-colors hover:bg-gray-200 hover:text-gray-600"
                    aria-label="Remove item"
                  >
                    <Trash2 class="h-4 w-4" />
                  </button>
                </div>

                <div class="mt-auto flex items-center justify-between pt-2">
                  <div class="inline-flex items-center rounded border border-gray-200 bg-white">
                    <button
                      type="button"
                      onclick={() => updateQuantity(line.variantId, line.quantity - 1)}
                      class="flex h-7 w-7 items-center justify-center text-gray-500 transition-colors hover:text-gray-700"
                      aria-label="Decrease quantity"
                    >
                      <Minus class="h-3 w-3" />
                    </button>
                    <span class="w-6 text-center text-xs font-medium">{line.quantity}</span>
                    <button
                      type="button"
                      onclick={() => updateQuantity(line.variantId, line.quantity + 1)}
                      class="flex h-7 w-7 items-center justify-center text-gray-500 transition-colors hover:text-gray-700"
                      aria-label="Increase quantity"
                    >
                      <Plus class="h-3 w-3" />
                    </button>
                  </div>
                  <span class="text-sm font-medium text-gray-900"
                    >{formatPrice(line.lineTotal)} EUR</span
                  >
                </div>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </div>

    {#if lines.length > 0}
      <SheetFooter class="mt-auto border-t border-gray-200 bg-gray-50/50 px-6 pt-4 pb-2">
        <div class="w-full space-y-4">
          {#if isUpdating}
            <div class="flex items-center justify-center py-3">
              <LoaderCircle class="h-4 w-4 animate-spin text-gray-400" />
              <span class="ml-2 text-sm text-gray-500">Updating...</span>
            </div>
          {:else if cart}
            <div class="space-y-2">
              <div class="flex justify-between text-sm">
                <span class="text-gray-500">Subtotal</span>
                <span class="text-gray-700">{formatPrice(cart.subtotal)} EUR</span>
              </div>

              {#if cart.discount > 0}
                <div class="flex justify-between text-sm text-green-600">
                  <span>Discount</span>
                  <span>-{formatPrice(cart.discount)} EUR</span>
                </div>
              {/if}

              {#if cart.isTaxExempt}
                <div class="flex justify-between text-sm text-gray-500">
                  <span>Tax exempt (B2B)</span>
                  <span>0.00 EUR</span>
                </div>
              {:else if cart.taxTotal > 0}
                <div class="flex justify-between text-sm text-gray-500">
                  <span>Incl. VAT</span>
                  <span>{formatPrice(cart.taxTotal)} EUR</span>
                </div>
              {/if}
            </div>

            <div class="flex justify-between border-t border-gray-200 pt-2">
              <span class="font-semibold text-gray-900">Total</span>
              <span class="font-semibold text-gray-900">{formatPrice(cart.total)} EUR</span>
            </div>
          {/if}

          <div class="mb-8">
            <a
              href="/checkout"
              onclick={() => cartStore.close()}
              class={buttonVariants({ size: "xl" }) + " w-full"}
            >
              Proceed to Checkout
            </a>
          </div>
        </div>
      </SheetFooter>
    {/if}
  </SheetContent>
</Sheet>
