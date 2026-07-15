<script lang="ts">
  import { enhance } from "$app/forms";
  import { Button } from "$lib/components/storefront/ui/button";
  import { Alert } from "$lib/components/storefront/ui/alert";
  import { cn } from "$lib/utils";
  import { imageUrl } from "$lib/image";
  import { cartStore } from "$lib/stores/cart.svelte";
  import { addToCart } from "$lib/remote/cart.remote";
  import type { PageData, ActionData } from "./$types";
  import Heart from "@lucide/svelte/icons/heart";
  import ImageIcon from "@lucide/svelte/icons/image";

  let { data, form }: { data: PageData; form: ActionData } = $props();

  const items = $derived(data.wishlistProducts);

  let removingId = $state<number | null>(null);
  let addingId = $state<number | null>(null);

  async function handleAddToCart(variantId: number) {
    addingId = variantId;
    cartStore.open();
    try {
      await addToCart({ variantId, quantity: 1 });
    } catch {
      // The cart sheet shows the authoritative state either way
    } finally {
      addingId = null;
    }
  }
  let message = $state<{ type: "success" | "error"; text: string } | null>(null);

  function getName(item: (typeof items)[0]): string {
    return item.product.name;
  }

  function getSlug(item: (typeof items)[0]): string {
    return item.product.slug;
  }

  function getPrice(item: (typeof items)[0]): number {
    return item.product.variants[0]?.price ?? 0;
  }

  function isInStock(item: (typeof items)[0]): boolean {
    const variant = item.product.variants[0];
    if (!variant) return false;
    return !variant.trackInventory || variant.stock > 0;
  }

  function getVariantId(item: (typeof items)[0]): number | null {
    return item.item.variantId ?? item.product.variants[0]?.id ?? null;
  }

  function getImage(item: (typeof items)[0]): string | null {
    return item.product.featuredAsset?.source ?? item.product.assets[0]?.source ?? null;
  }

  function getProductId(item: (typeof items)[0]): number {
    return item.product.id;
  }
</script>

<svelte:head>
  <title>Wishlist | Hoikka</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<div class="mx-auto max-w-4xl px-4 py-8">
  <div class="mb-8 flex items-center justify-between">
    <h1 class="text-3xl font-bold">Wishlist</h1>
    {#if items.length > 0}
      <form method="POST" action="?/clear" use:enhance>
        <button type="submit" class="text-sm text-red-600 hover:text-red-700"> Clear all </button>
      </form>
    {/if}
  </div>

  {#if message}
    <Alert variant="success" class="mb-6">
      {message.text}
    </Alert>
  {/if}

  {#if items.length === 0}
    <div class="rounded-lg border border-dashed border-gray-300 p-12 text-center">
      <Heart class="mx-auto h-12 w-12 text-gray-400" />
      <h3 class="mt-4 text-lg font-medium">Your wishlist is empty</h3>
      <p class="mt-2 text-gray-500">Start adding products you love!</p>
      <a
        href="/products"
        class="mt-6 inline-block rounded-lg bg-blue-600 px-6 py-3 text-white hover:bg-blue-700"
      >
        Browse Products
      </a>
    </div>
  {:else}
    <div class="space-y-4">
      {#each items as item}
        {@const name = getName(item)}
        {@const slug = getSlug(item)}
        {@const productId = getProductId(item)}
        {@const price = getPrice(item)}
        {@const available = isInStock(item)}
        {@const variantId = getVariantId(item)}
        {@const image = getImage(item)}

        <div class="flex gap-4 rounded-lg border border-gray-300 p-4">
          <a href="/products/{productId}/{slug}" class="shrink-0">
            {#if image}
              <img
                src={imageUrl(image, 100)}
                alt={name}
                class="h-20 w-20 rounded-lg object-cover"
              />
            {:else}
              <div class="flex h-20 w-20 items-center justify-center rounded-lg bg-gray-100">
                <ImageIcon class="h-8 w-8 text-gray-400" />
              </div>
            {/if}
          </a>

          <div class="flex flex-1 flex-col">
            <div class="flex items-start justify-between">
              <a href="/products/{productId}/{slug}" class="font-medium hover:text-blue-600"
                >{name}</a
              >
              <span class="text-lg font-semibold">{(price / 100).toFixed(2)} EUR</span>
            </div>

            <div class="mt-auto flex items-center justify-between pt-4">
              <span class={cn("text-sm", available ? "text-green-600" : "text-red-600")}>
                {available ? "In stock" : "Out of stock"}
              </span>

              <div class="flex items-center gap-3">
                <form
                  method="POST"
                  action="?/remove"
                  use:enhance={() => {
                    removingId = item.item.productId;
                    return async ({ update }) => {
                      await update();
                      removingId = null;
                    };
                  }}
                >
                  <input type="hidden" name="productId" value={item.item.productId} />
                  <button
                    type="submit"
                    disabled={removingId === item.item.productId}
                    class="text-sm text-gray-500 hover:text-red-600 disabled:opacity-50"
                  >
                    {removingId === item.item.productId ? "Removing..." : "Remove"}
                  </button>
                </form>

                {#if variantId && available}
                  <Button
                    size="sm"
                    disabled={addingId === variantId}
                    onclick={() => handleAddToCart(variantId)}
                  >
                    {addingId === variantId ? "Adding..." : "Add to Cart"}
                  </Button>
                {/if}
              </div>
            </div>
          </div>
        </div>
      {/each}
    </div>

    <div class="mt-8 text-center">
      <a href="/products" class="text-blue-600 hover:underline">Continue Shopping</a>
    </div>
  {/if}
</div>
