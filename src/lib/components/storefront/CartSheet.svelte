<script lang="ts">
  import { invalidateAll, goto } from "$app/navigation";
  import { page } from "$app/stores";
  import { updateCartLineQuantity, removeCartLine } from "$lib/remote/cart.remote";
  import { imageUrl } from "$lib/image";
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

  // Read cart data from store (enables optimistic updates)
  // Use getter functions for proper reactivity across modules
  const cart = $derived.by(() => cartStore.cart);
  const itemCount = $derived.by(() => cartStore.itemCount);
  const isLoading = $derived.by(() => cartStore.isLoading);
  const lines = $derived(cart?.lines ?? []);
  const subtotal = $derived(cart?.subtotal ?? 0);
  const total = $derived(cart?.total ?? 0);
  const discount = $derived(cart?.discount ?? 0);
  const taxTotal = $derived(cart?.taxTotal ?? 0);
  const cartIsTaxExempt = $derived(cart?.isTaxExempt ?? false);

  function formatPrice(cents: number): string {
    return (cents / 100).toFixed(2);
  }

  const isOnCheckout = $derived($page.url.pathname === "/checkout");

  async function afterCartChange() {
    if (isOnCheckout) {
      await invalidateAll();
      // If cart is now empty, redirect away
      if (cartStore.itemCount === 0) {
        cartStore.close();
        goto("/products");
      }
    }
  }

  async function updateQuantity(lineId: number, newQuantity: number) {
    // Optimistic: update store immediately
    cartStore.updateLineQuantity(lineId, newQuantity);

    // Server sync
    try {
      await updateCartLineQuantity({ lineId, quantity: newQuantity });
      await afterCartChange();
    } catch {
      // On error, refetch to restore correct state
      invalidateAll();
    }
  }

  async function removeLine(lineId: number) {
    // Optimistic: remove from store immediately
    cartStore.removeLine(lineId);

    // Server sync
    try {
      await removeCartLine({ lineId });
      await afterCartChange();
    } catch {
      // On error, refetch to restore correct state
      invalidateAll();
    }
  }
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
          {#each [1, 2] as _}
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
          {#each lines as line (line.id)}
            <div class="flex gap-3 p-3">
              <div class="h-20 w-20 shrink-0 overflow-hidden rounded-md bg-gray-100">
                {#if line.imageUrl}
                  <img
                    src={imageUrl(line.imageUrl, 100)}
                    alt={line.productName}
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
                      {line.productName || "Untitled product"}
                    </h4>
                    {#if line.variantName}
                      <p class="text-xs text-gray-500">{line.variantName}</p>
                    {/if}
                  </div>
                  <button
                    type="button"
                    onclick={() => removeLine(line.id)}
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
                      onclick={() => updateQuantity(line.id, line.quantity - 1)}
                      class="flex h-7 w-7 items-center justify-center text-gray-500 transition-colors hover:text-gray-700"
                      aria-label="Decrease quantity"
                    >
                      <Minus class="h-3 w-3" />
                    </button>
                    <span class="w-6 text-center text-xs font-medium">{line.quantity}</span>
                    <button
                      type="button"
                      onclick={() => updateQuantity(line.id, line.quantity + 1)}
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
          <div class="space-y-2">
            <div class="flex justify-between text-sm">
              <span class="text-gray-500">Subtotal</span>
              <span class="text-gray-700">{formatPrice(subtotal)} EUR</span>
            </div>

            {#if discount > 0}
              <div class="flex justify-between text-sm text-green-600">
                <span>Discount</span>
                <span>-{formatPrice(discount)} EUR</span>
              </div>
            {/if}

            {#if cartIsTaxExempt}
              <div class="flex justify-between text-sm text-gray-500">
                <span>Tax exempt (B2B)</span>
                <span>0.00 EUR</span>
              </div>
            {:else if taxTotal > 0}
              <div class="flex justify-between text-sm text-gray-500">
                <span>Incl. VAT</span>
                <span>{formatPrice(taxTotal)} EUR</span>
              </div>
            {/if}
          </div>

          <div class="flex justify-between border-t border-gray-200 pt-2">
            <span class="font-semibold text-gray-900">Total</span>
            <span class="font-semibold text-gray-900">{formatPrice(total)} EUR</span>
          </div>

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
