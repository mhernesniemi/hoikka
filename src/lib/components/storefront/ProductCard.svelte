<script lang="ts">
  import type { ProductWithRelations } from "$lib/types";
  import { formatPrice, cn } from "$lib/utils";
  import Img from "$lib/components/storefront/Img.svelte";
  import { findBestDiscount, getDiscountedPrice, type ActiveDiscount } from "$lib/promotion-utils";
  import ImageIcon from "@lucide/svelte/icons/image";

  let {
    product,
    activeDiscounts = [],
    grayscale = false,
    showFromPrice,
    loading = "lazy"
  }: {
    product: ProductWithRelations;
    activeDiscounts?: ActiveDiscount[];
    grayscale?: boolean;
    showFromPrice?: boolean;
    /** Use "eager" for above-the-fold cards */
    loading?: "lazy" | "eager";
  } = $props();

  const name = $derived(product.name);
  const slug = $derived(product.slug);

  const lowestPrice = $derived(
    product.variants.length > 0
      ? Math.min(...product.variants.map((v) => v.effectivePrice ?? v.price))
      : null
  );

  const hasPriceRange = $derived.by(() => {
    if (showFromPrice !== undefined) return showFromPrice;
    if (product.variants.length <= 1) return false;
    const prices = product.variants.map((v) => v.effectivePrice ?? v.price);
    return Math.min(...prices) !== Math.max(...prices);
  });

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
      <Img
        src={product.featuredAsset.source}
        alt={name}
        width={400}
        sizes="(max-width: 640px) 50vw, 33vw"
        {loading}
        fetchpriority={loading === "eager" ? "high" : "auto"}
        focalX={product.featuredAsset.focalX}
        focalY={product.featuredAsset.focalY}
        class={cn(
          "h-full w-full object-cover transition-transform group-hover:scale-105",
          grayscale && "opacity-70 grayscale group-hover:opacity-90 group-hover:grayscale-0"
        )}
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
          <span class="font-semibold text-red-600"
            >{hasPriceRange ? "From " : ""}{formatPrice(discountedPrice)}</span
          >
        </div>
      {:else}
        <p class="mt-1 text-sm text-gray-700">
          {hasPriceRange ? "From " : ""}{formatPrice(displayPrice)}
        </p>
      {/if}
    {/if}
  </div>
</a>
