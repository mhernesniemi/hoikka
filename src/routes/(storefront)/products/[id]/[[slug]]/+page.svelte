<script lang="ts">
  import hoikkaConfig from "$hoikka/config";
  import { customFields } from "$lib/fields/index.js";
  import { STORE_NAME } from "$lib/config/store.js";
  import { browser } from "$app/environment";
  import { cn, formatPrice, stripHtml, commandErrorMessage } from "$lib/utils";
  import { imageUrl, imageSrcset } from "$lib/image";
  import { galleryImages, HERO_SIZES, HERO_WIDTH } from "$lib/product-images";
  import { productJsonLd } from "$lib/seo";
  import { addVariantToCart, optimisticSeed } from "$lib/cart-actions";
  import { toggleWishlist, isProductWishlisted } from "$lib/remote/wishlist.remote";
  import { cartStore } from "$lib/stores/cart.svelte";
  import { findBestDiscount, getDiscountedPrice } from "$lib/promotion-utils";
  import ProductGallery from "$lib/components/storefront/ProductGallery.svelte";
  import ProductReviews from "$lib/components/storefront/ProductReviews.svelte";
  import ProductCard from "$lib/components/storefront/ProductCard.svelte";
  import { Button, buttonVariants } from "$lib/components/storefront/ui/button";
  import { Alert } from "$lib/components/storefront/ui/alert";
  import Heart from "@lucide/svelte/icons/heart";
  import CheckIcon from "@lucide/svelte/icons/check";
  import ChevronRight from "@lucide/svelte/icons/chevron-right";
  import type { PageData, ActionData } from "./$types";

  let { data, form }: { data: PageData; form: ActionData } = $props();

  const product = $derived(data.product);
  const images = $derived(galleryImages(product));

  // --- Selection state -------------------------------------------------
  let selectedVariantId = $state<number | null>(null);
  let quantity = $state(1);
  let isTogglingWishlist = $state(false);
  let wishlistOverride = $state<boolean | null>(null);
  let message = $state<{ type: "success" | "error"; text: string } | null>(null);
  let selectedImageIndex = $state(0);

  // Reset per-product state when navigating to a different product: the
  // component instance is reused across client-side navigations (e.g. via
  // related products), so $state survives and would otherwise keep pointing
  // at the previous product's variants/images. Guarded by id so data
  // invalidations of the same product preserve the user's selection.
  let shownProductId: number | null = null;
  $effect(() => {
    if (product.id === shownProductId) return;
    shownProductId = product.id;
    selectedVariantId = product.variants[0]?.id ?? null;
    selectedImageIndex = 0;
    quantity = 1;
    wishlistOverride = null;
    message = null;
  });

  const selectedVariant = $derived(product.variants.find((v) => v.id === selectedVariantId));

  // Custom-field values declared for this product's type in hoikka.config.ts.
  // Image fields are omitted here — they are assets, not spec-sheet lines.
  const detailEntries = $derived(
    (hoikkaConfig.productTypes[product.type]?.fields ?? [])
      .filter((def) => def.type !== "image")
      .map((def) => [def, customFields([def], product)[def.key]] as const)
      .filter(([, value]) => value !== undefined && value !== "")
  );

  // When variant changes, jump to its image
  $effect(() => {
    if (selectedVariant?.imageUrl) {
      const idx = images.findIndex((img) => img.source === selectedVariant.imageUrl);
      if (idx >= 0) selectedImageIndex = idx;
    }
  });

  // --- Pricing ---------------------------------------------------------
  // Effective price for selected variant (group price already stamped server-side)
  const variantPrice = $derived(
    selectedVariant ? (selectedVariant.effectivePrice ?? selectedVariant.price) : null
  );
  const bestDiscount = $derived(
    selectedVariant && variantPrice && data.activeDiscounts
      ? findBestDiscount(data.activeDiscounts, product.id, variantPrice)
      : null
  );
  const discountedVariantPrice = $derived(
    bestDiscount && variantPrice ? getDiscountedPrice(bestDiscount, variantPrice) : null
  );
  const displayVariantPrice = $derived(discountedVariantPrice ?? variantPrice);

  // Wishlist state is client-only: the page is edge-cached for guests, and a
  // query created during SSR would serialize per-visitor state into shared HTML
  const wishlistedQuery = $derived(browser ? isProductWishlisted(product.id) : null);
  const isWishlisted = $derived(wishlistOverride ?? wishlistedQuery?.current ?? false);

  function getVariantName(variant: (typeof product.variants)[0]): string {
    return variant.name ?? variant.sku;
  }

  function buildCategoryPath(breadcrumbs: typeof data.breadcrumbs, upToIndex: number): string {
    return (
      "/category/" +
      breadcrumbs
        .slice(0, upToIndex + 1)
        .map((b) => b.slug)
        .join("/")
    );
  }

  // --- Actions ---------------------------------------------------------
  async function handleAddToCart() {
    const variant = selectedVariant;
    if (!variant) return;
    message = null;
    cartStore.open();
    try {
      await addVariantToCart(optimisticSeed(product, variant), quantity);
    } catch (error) {
      cartStore.close();
      message = { type: "error", text: commandErrorMessage(error, "Failed to add item to cart") };
    }
  }

  async function handleToggleWishlist() {
    isTogglingWishlist = true;
    // Optimistic heart state — the badge count refreshes single-flight
    const willBeAdded = !isWishlisted;
    wishlistOverride = willBeAdded;
    try {
      const { added } = await toggleWishlist({ productId: product.id });
      wishlistOverride = added;
    } catch {
      wishlistOverride = !willBeAdded;
      message = { type: "error", text: "Failed to update wishlist" };
      setTimeout(() => (message = null), 3000);
    } finally {
      isTogglingWishlist = false;
    }
  }
</script>

<svelte:head>
  <title>{product.name} | {STORE_NAME}</title>
  <meta
    name="description"
    content={stripHtml(product.description)?.slice(0, 160) ||
      "View product details and add to cart."}
  />
  <meta property="og:title" content={product.name} />
  <meta property="og:description" content={stripHtml(product.description)?.slice(0, 160) ?? ""} />
  <meta property="og:type" content="product" />
  {#if product.featuredAsset}
    <meta property="og:image" content={product.featuredAsset.source} />
  {/if}

  <!-- Fetch the hero image at document parse time, before hydration -->
  {#if images.length > 0}
    <link
      rel="preload"
      as="image"
      href={imageUrl(images[0].source, HERO_WIDTH)}
      imagesrcset={imageSrcset(images[0].source, HERO_WIDTH)}
      imagesizes={HERO_SIZES}
      fetchpriority="high"
    />
  {/if}

  <!-- JSON-LD Structured Data (code-generated, not user input) -->
  <!-- eslint-disable-next-line svelte/no-at-html-tags -->
  {@html productJsonLd(product, data.rating)}
</svelte:head>

<div class="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
  <div class="mb-6 flex items-center justify-between">
    <nav aria-label="Breadcrumb">
      <ol class="flex items-center gap-1 text-sm">
        <li>
          <a href="/products" class="text-gray-500 hover:text-gray-700">Products</a>
        </li>
        {#each data.breadcrumbs as crumb, index}
          <li class="flex items-center gap-1">
            <ChevronRight class="h-3.5 w-3.5 text-gray-400" />
            <a
              href={buildCategoryPath(data.breadcrumbs, index)}
              class="text-gray-500 hover:text-gray-700"
            >
              {crumb.name}
            </a>
          </li>
        {/each}
        <li class="flex items-center gap-1">
          <ChevronRight class="h-3.5 w-3.5 text-gray-400" />
          <span class="font-medium text-gray-900">{product.name}</span>
        </li>
      </ol>
    </nav>
    {#if data.isAdmin}
      <a
        href="/admin/products/{product.id}"
        class={buttonVariants({ variant: "outline", size: "sm" })}>Edit</a
      >
    {/if}
  </div>

  <div class="grid grid-cols-1 md:grid-cols-2">
    <ProductGallery
      {images}
      bind:selectedIndex={selectedImageIndex}
      alt={product.name}
      onSelectImage={(image) => {
        const matchingVariant = product.variants.find((v) => v.imageUrl === image.source);
        if (matchingVariant) selectedVariantId = matchingVariant.id;
      }}
    />

    <!-- Product Info -->
    <div class="ml-0 md:ml-10">
      <div class="mb-4 flex items-center justify-between">
        <h1 class="text-3xl font-bold">{product.name}</h1>
        <button
          type="button"
          onclick={handleToggleWishlist}
          disabled={isTogglingWishlist}
          class={cn(
            "rounded-full p-2 transition-colors disabled:opacity-50",
            isWishlisted ? "text-red-500 hover:text-red-600" : "text-gray-400 hover:text-red-500"
          )}
          aria-label={isWishlisted ? "Remove from wishlist" : "Add to wishlist"}
        >
          <Heart class="h-6 w-6" fill={isWishlisted ? "currentColor" : "none"} />
        </button>
      </div>

      {#if selectedVariant && displayVariantPrice !== null}
        <div class="mb-8">
          <!-- Discounted price -->
          <p class="text-xl font-extrabold" class:text-red-600={discountedVariantPrice !== null}>
            {formatPrice(displayVariantPrice)}
          </p>

          <!-- Original price + discount badge -->
          {#if discountedVariantPrice !== null && variantPrice !== null}
            <div class="mt-2 flex items-center gap-2">
              {#if bestDiscount}
                <span class="rounded bg-yellow-300 px-2 py-0.5 text-xs font-bold text-gray-900">
                  {bestDiscount.discountType === "percentage"
                    ? `-${bestDiscount.discountValue} %`
                    : `-${formatPrice(bestDiscount.discountValue)}`}
                </span>
              {/if}
              <span class="text-base text-gray-400 line-through">
                {formatPrice(variantPrice)}
              </span>
            </div>
          {/if}
        </div>
      {/if}

      {#if product.description}
        <div class="prose mb-8 max-w-none prose-gray">
          <!-- eslint-disable-next-line svelte/no-at-html-tags -- sanitized on save in admin -->
          {@html product.description}
        </div>
      {/if}

      <!-- Custom fields from hoikka.config.ts (this product type's "Details") -->
      {#if detailEntries.length > 0}
        <dl class="mb-8 grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-sm">
          {#each detailEntries as [def, value] (def.key)}
            <dt class="font-medium text-gray-700">{def.label}</dt>
            <dd class="text-gray-600">
              {#if def.type === "richtext"}
                <!-- eslint-disable-next-line svelte/no-at-html-tags -- sanitized on save in admin -->
                {@html value}
              {:else if def.type === "boolean"}
                {value ? "Yes" : "No"}
              {:else}
                {value}
              {/if}
            </dd>
          {/each}
        </dl>
      {/if}

      <!-- Variant Selection -->
      {#if product.variants.length > 1}
        {@const hasVariantImages = product.variants.some((v) => v.imageUrl)}
        <div class="mb-8">
          <p class="mb-2 block text-sm font-medium text-gray-700">Select Variant</p>
          <div class="flex flex-wrap gap-2" role="group" aria-label="Product variants">
            {#each product.variants as variant}
              {#if hasVariantImages && variant.imageUrl}
                <button
                  type="button"
                  onclick={() => (selectedVariantId = variant.id)}
                  class={cn(
                    "h-16 w-16 overflow-hidden rounded-lg border-2 transition-colors",
                    selectedVariantId === variant.id
                      ? "border-blue-600"
                      : "border-gray-300 hover:border-gray-400"
                  )}
                  title={getVariantName(variant)}
                >
                  <img
                    src={imageUrl(variant.imageUrl, 100)}
                    alt={getVariantName(variant)}
                    class="h-full w-full object-cover"
                  />
                </button>
              {:else}
                <button
                  type="button"
                  onclick={() => (selectedVariantId = variant.id)}
                  class={cn(
                    "rounded-lg border px-3 py-1 text-sm transition-colors",
                    selectedVariantId === variant.id
                      ? "border-blue-600 bg-blue-50 text-blue-600"
                      : "border-gray-300 hover:border-gray-400"
                  )}
                >
                  {getVariantName(variant)}
                </button>
              {/if}
            {/each}
          </div>
        </div>
      {/if}

      <!-- Success/Error Messages -->
      {#if message}
        <Alert variant={message.type === "error" ? "destructive" : "success"} class="mb-4">
          {message.text}
        </Alert>
      {/if}

      <!-- Stock Status -->
      {#if selectedVariant}
        <div class="mb-3 text-sm">
          {#if !selectedVariant.trackInventory || selectedVariant.stock > 0}
            <div class="flex items-center gap-2">
              <CheckIcon class="h-4 w-4 text-green-600" />
              <span class="text-green-600">In stock</span>
            </div>
          {:else}
            <span class="text-red-600">Out of stock</span>
          {/if}
        </div>
      {/if}

      <!-- Add to Cart -->
      {#if selectedVariant && (!selectedVariant.trackInventory || selectedVariant.stock > 0)}
        <Button type="button" size="xl" onclick={handleAddToCart} class="flex-1 py-3">
          Add to Cart
        </Button>
      {/if}
    </div>
  </div>

  <!-- Reviews (keyed so form state resets per product) -->
  {#key product.id}
    <ProductReviews
      reviews={data.reviews}
      rating={data.rating}
      customerId={data.customerId}
      customerReview={data.customerReview}
      productPath="/products/{product.id}/{product.slug}"
      {form}
    />
  {/key}

  <!-- Related Products -->
  {#if data.relatedProducts.length > 0}
    <section class="mt-8 border-t border-gray-200 pt-8">
      <h2 class="mb-6 text-xl font-bold">You May Also Like</h2>
      <div
        class="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4"
        data-sveltekit-preload-data="viewport"
      >
        {#each data.relatedProducts as relatedProduct}
          <ProductCard
            product={relatedProduct}
            activeDiscounts={data.activeDiscounts}
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 300px"
          />
        {/each}
      </div>
    </section>
  {/if}
</div>
