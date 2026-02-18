<script lang="ts">
  import type { ProductWithRelations } from "$lib/types";
  import { formatPrice } from "$lib/utils";
  import { imageUrl, focalPosition } from "$lib/image";
  import { findBestDiscount, getDiscountedPrice, type ActiveDiscount } from "$lib/promotion-utils";
  import ImageIcon from "@lucide/svelte/icons/image";

  let {
    product,
    activeDiscounts = []
  }: {
    product: ProductWithRelations;
    activeDiscounts?: ActiveDiscount[];
  } = $props();

  const name = $derived(product.name);
  const slug = $derived(product.slug);

  const lowestPrice = $derived(
    product.variants.length > 0
      ? Math.min(...product.variants.map((v) => v.effectivePrice ?? v.price))
      : null
  );

  const bestDiscount = $derived(
    lowestPrice ? findBestDiscount(activeDiscounts, product.id, lowestPrice) : null
  );

  const discountedPrice = $derived(
    bestDiscount && lowestPrice ? getDiscountedPrice(bestDiscount, lowestPrice) : null
  );

  const displayPrice = $derived(discountedPrice ?? lowestPrice);
</script>

<a
  href="/products/{product.id}/{slug}"
  class="group relative overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm transition-shadow hover:shadow-md"
>
  {#if bestDiscount}
    <div class="absolute top-2 left-2 z-10">
      <span class="rounded bg-red-600 px-2 py-0.5 text-xs font-semibold text-white">
        {bestDiscount.discountType === "percentage"
          ? `-${bestDiscount.discountValue}%`
          : `-${formatPrice(bestDiscount.discountValue)}`}
      </span>
    </div>
  {/if}
  <div class="aspect-square overflow-hidden bg-gray-100">
    {#if product.featuredAsset}
      <img
        src={imageUrl(product.featuredAsset.source, 400)}
        alt={name}
        class="h-full w-full object-cover grayscale transition-transform group-hover:scale-105"
        style="object-position: {focalPosition(
          product.featuredAsset.focalX,
          product.featuredAsset.focalY
        )}"
      />
    {:else}
      <div class="flex h-full w-full items-center justify-center text-gray-400">
        <ImageIcon class="h-16 w-16" />
      </div>
    {/if}
  </div>
  <div class="p-4">
    <h3 class="text-sm font-medium text-gray-900 group-hover:text-blue-600">
      {name}
    </h3>
    {#if displayPrice !== null}
      {#if discountedPrice !== null && lowestPrice !== null}
        <div class="mt-1 flex items-center gap-2 text-sm">
          <span class="text-gray-400 line-through">{formatPrice(lowestPrice)}</span>
          <span class="font-semibold text-red-600">From {formatPrice(discountedPrice)}</span>
        </div>
      {:else}
        <p class="mt-1 text-sm text-gray-700">
          From {formatPrice(displayPrice)}
        </p>
      {/if}
    {/if}
  </div>
</a>
