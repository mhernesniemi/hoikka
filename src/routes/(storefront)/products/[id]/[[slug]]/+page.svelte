<script lang="ts">
  import { enhance } from "$app/forms";
  import { cn } from "$lib/utils";
  import { imageUrl } from "$lib/image";
  import Img from "$lib/components/storefront/Img.svelte";
  import { addToCart } from "$lib/remote/cart.remote";
  import { toggleWishlist } from "$lib/remote/wishlist.remote";
  import { cartStore } from "$lib/stores/cart.svelte";
  import { formatPrice, stripHtml } from "$lib/utils";
  import { findBestDiscount, getDiscountedPrice } from "$lib/promotion-utils";
  import ProductCard from "$lib/components/storefront/ProductCard.svelte";
  import { Button, buttonVariants } from "$lib/components/storefront/ui/button";
  import { Alert } from "$lib/components/storefront/ui/alert";
  import { Badge } from "$lib/components/storefront/ui/badge";
  import ImageIcon from "@lucide/svelte/icons/image";
  import Heart from "@lucide/svelte/icons/heart";
  import CheckIcon from "@lucide/svelte/icons/check";
  import ChevronRight from "@lucide/svelte/icons/chevron-right";
  import type { PageData, ActionData } from "./$types";

  let { data, form }: { data: PageData; form: ActionData } = $props();

  const product = $derived(data.product);

  // JSON-LD structured data, built here as a string because a template literal
  // containing <script> in the markup breaks the eslint Svelte parser.
  const jsonLd = $derived(
    `<script type="application/ld+json">${JSON.stringify({
      "@context": "https://schema.org",
      "@type": "Product",
      name: product.name,
      description: stripHtml(product.description),
      image: product.featuredAsset?.source,
      sku: product.variants[0]?.sku,
      offers: {
        "@type": "AggregateOffer",
        priceCurrency: "EUR",
        lowPrice: (Math.min(...product.variants.map((v) => v.price)) / 100).toFixed(2),
        highPrice: (Math.max(...product.variants.map((v) => v.price)) / 100).toFixed(2),
        offerCount: product.variants.length,
        availability: product.variants.some((v) => !v.trackInventory || v.stock > 0)
          ? "https://schema.org/InStock"
          : "https://schema.org/OutOfStock"
      },
      ...(data.rating.count > 0
        ? {
            aggregateRating: {
              "@type": "AggregateRating",
              ratingValue: data.rating.average.toFixed(1),
              reviewCount: data.rating.count
            }
          }
        : {})
      // closing tag written via concatenation — the literal would end this script block
    })}${"</scr" + "ipt>"}`
  );

  let selectedVariantId = $state<number | null>(null);
  let quantity = $state(1);
  let isTogglingWishlist = $state(false);
  let wishlistOverride = $state<boolean | null>(null);
  let message = $state<{ type: "success" | "error"; text: string } | null>(null);
  let selectedImageIndex = $state(0);

  // Use override if set (after toggle), otherwise use server data
  const isWishlisted = $derived(wishlistOverride ?? data.isWishlisted);

  // Build a stable image list: product assets + unique variant images
  const allImages = $derived.by(() => {
    const productImages =
      product.assets.length > 0
        ? product.assets
        : product.featuredAsset
          ? [product.featuredAsset]
          : [];

    const existingSources = new Set(productImages.map((img) => img.source));

    const variantImages = product.variants
      .filter((v) => v.imageUrl && !existingSources.has(v.imageUrl))
      .reduce(
        (acc, v) => {
          if (!acc.seen.has(v.imageUrl!)) {
            acc.seen.add(v.imageUrl!);
            acc.images.push({
              id: -v.id,
              name: v.name || v.sku,
              type: "image" as const,
              mimeType: "image/jpeg",
              width: 0,
              height: 0,
              fileSize: 0,
              source: v.imageUrl!,
              alt: null,
              focalX: 0.5,
              focalY: 0.5,
              createdAt: new Date()
            });
          }
          return acc;
        },
        { seen: new Set<string>(), images: [] as typeof productImages }
      );

    return [...productImages, ...variantImages.images];
  });

  // Initialize selected variant when product loads
  $effect(() => {
    if (product.variants[0] && selectedVariantId === null) {
      selectedVariantId = product.variants[0].id;
    }
  });

  const selectedVariant = $derived(product.variants.find((v) => v.id === selectedVariantId));

  const images = $derived(allImages);

  // When variant changes, jump to its image
  $effect(() => {
    if (selectedVariant?.imageUrl) {
      const idx = images.findIndex((img) => img.source === selectedVariant.imageUrl);
      if (idx >= 0) selectedImageIndex = idx;
    }
  });

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

  function getVariantName(variant: (typeof product.variants)[0]): string {
    return variant.name ?? variant.sku;
  }

  // Review form state
  let reviewNickname = $state("");
  let reviewRating = $state(0);
  let reviewComment = $state("");
  let isSubmittingReview = $state(false);
  let hoverRating = $state(0);
  let showReviewForm = $state(false);

  function buildCategoryPath(breadcrumbs: typeof data.breadcrumbs, upToIndex: number): string {
    return (
      "/category/" +
      breadcrumbs
        .slice(0, upToIndex + 1)
        .map((b) => b.slug)
        .join("/")
    );
  }

  function formatDate(date: Date | string): string {
    return new Date(date).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric"
    });
  }

  async function handleAddToCart() {
    if (!selectedVariantId) return;
    message = null;

    cartStore.open();

    try {
      // Single-flight mutation: the refreshed cart rides back on this response
      await addToCart({ variantId: selectedVariantId, quantity });
    } catch (error) {
      cartStore.close();
      message = {
        type: "error",
        text: error instanceof Error ? error.message : "Failed to add item to cart"
      };
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
  <title>{product.name} | Hoikka</title>
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

  <!-- JSON-LD Structured Data -->
  {@html jsonLd}
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
    <!-- Product Images -->
    <div>
      <!-- Main Image -->
      <div class="aspect-square overflow-hidden rounded-lg bg-gray-100">
        {#if images.length > 0}
          {@const currentImage = images[selectedImageIndex]}
          <Img
            src={currentImage.source}
            alt={product.name}
            width={600}
            sizes="(max-width: 1024px) 100vw, 600px"
            loading="eager"
            focalX={currentImage.focalX}
            focalY={currentImage.focalY}
            class="h-full w-full object-cover"
          />
        {:else}
          <div class="flex h-full w-full items-center justify-center text-gray-400">
            <ImageIcon class="h-24 w-24" />
          </div>
        {/if}
      </div>

      <!-- Thumbnails -->
      {#if images.length > 1}
        <div class="mt-4 mb-6 flex gap-2 overflow-x-auto lg:mb-0">
          {#each images as image, index}
            <button
              type="button"
              onclick={() => {
                selectedImageIndex = index;
                const matchingVariant = product.variants.find((v) => v.imageUrl === image.source);
                if (matchingVariant) selectedVariantId = matchingVariant.id;
              }}
              class={cn(
                "h-16 w-16 shrink-0 overflow-hidden rounded-lg border-2 transition-colors",
                selectedImageIndex === index
                  ? "border-blue-500"
                  : "border-transparent hover:border-gray-300"
              )}
            >
              <Img
                src={image.source}
                alt=""
                width={100}
                focalX={image.focalX}
                focalY={image.focalY}
                class="h-full w-full object-cover"
              />
            </button>
          {/each}
        </div>
      {/if}
    </div>

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
          {@html product.description}
        </div>
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

  <!-- Reviews Section -->
  <div class="mt-12 border-t border-gray-200 pt-8">
    <!-- Header: title + write a review link -->
    <div class="mb-5 flex items-center justify-between">
      <h2 class="text-xl font-bold">Customer Reviews</h2>
      {#if data.customerId}
        {#if data.customerReview}
          <span class="text-sm text-gray-500">
            You've reviewed this product
            {#if data.customerReview.status === "pending"}
              (pending approval)
            {/if}
          </span>
        {:else}
          <button
            type="button"
            class="text-blue-600 hover:underline"
            onclick={() => (showReviewForm = !showReviewForm)}
          >
            Write a review
          </button>
        {/if}
      {:else}
        <a
          href="/sign-in?redirect={encodeURIComponent(`/products/${product.id}/${product.slug}`)}"
          class="text-blue-600 hover:underline"
        >
          Write a review
        </a>
      {/if}
    </div>

    <!-- Collapsible Review Form -->
    {#if showReviewForm && data.customerId && !data.customerReview}
      <div class="mt-6 mb-8 rounded-lg border bg-gray-50 p-6">
        {#if form?.reviewError}
          <Alert variant="destructive" class="mb-4">{form.reviewError}</Alert>
        {/if}

        {#if form?.reviewSuccess}
          <Alert variant="success" class="mb-4">
            Thank you for your review! It will be visible after approval.
          </Alert>
        {:else}
          <form
            method="POST"
            action="?/submitReview"
            use:enhance={() => {
              isSubmittingReview = true;
              return async ({ update, result }) => {
                isSubmittingReview = false;
                if (result.type === "success") {
                  showReviewForm = false;
                  reviewNickname = "";
                  reviewRating = 0;
                  reviewComment = "";
                }
                await update({ reset: false });
              };
            }}
          >
            <div class="mb-4">
              <label for="review-nickname" class="mb-2 block text-sm font-medium text-gray-700">
                Your Nickname <span class="text-red-500">*</span>
              </label>
              <input
                type="text"
                id="review-nickname"
                name="nickname"
                bind:value={reviewNickname}
                required
                maxlength="100"
                class="w-full rounded-lg border border-gray-300 px-3 py-2"
                placeholder="Enter a display name for your review"
              />
            </div>

            <fieldset class="mb-4">
              <legend class="mb-2 block text-sm font-medium text-gray-700"
                >Your Rating <span class="text-red-500">*</span></legend
              >
              <div class="flex gap-1" role="radiogroup" aria-label="Rating">
                {#each [1, 2, 3, 4, 5] as star}
                  <button
                    type="button"
                    role="radio"
                    aria-checked={reviewRating === star}
                    aria-label="{star} star{star > 1 ? 's' : ''}"
                    onclick={() => (reviewRating = star)}
                    onmouseenter={() => (hoverRating = star)}
                    onmouseleave={() => (hoverRating = 0)}
                    class={cn(
                      "text-3xl transition-colors",
                      star <= (hoverRating || reviewRating) ? "text-yellow-400" : "text-gray-300"
                    )}
                  >
                    ★
                  </button>
                {/each}
              </div>
              <input type="hidden" name="rating" value={reviewRating} />
            </fieldset>

            <div class="mb-4">
              <label for="review-comment" class="mb-2 block text-sm font-medium text-gray-700">
                Your Review (optional)
              </label>
              <textarea
                id="review-comment"
                name="comment"
                bind:value={reviewComment}
                rows="4"
                class="w-full rounded-lg border border-gray-300 px-3 py-2"
                placeholder="Share your experience with this product..."></textarea>
            </div>

            <div class="flex items-center gap-3">
              <Button
                type="submit"
                disabled={isSubmittingReview || reviewRating === 0 || !reviewNickname.trim()}
              >
                {isSubmittingReview ? "Submitting..." : "Submit Review"}
              </Button>
              <button
                type="button"
                class="text-sm text-gray-500 hover:text-gray-700"
                onclick={() => (showReviewForm = false)}
              >
                Cancel
              </button>
            </div>
          </form>
        {/if}
      </div>
    {/if}

    <!-- Reviews List -->
    {#if data.reviews.length > 0}
      <div class="grid grid-cols-1 gap-20 sm:grid-cols-[180px_1fr]">
        <!-- Left column: aggregate rating -->
        <div>
          <div class="flex gap-0.5">
            {#each [1, 2, 3, 4, 5] as star}
              {@const fill = Math.min(1, Math.max(0, data.rating.average - (star - 1)))}
              <svg class="h-5 w-5 text-amber-400" viewBox="0 0 20 20">
                <defs>
                  <clipPath id="star-clip-{star}">
                    <rect x="0" y="0" width={fill * 20} height="20" />
                  </clipPath>
                </defs>
                <path
                  d="M10 1l2.39 4.84L18 6.71l-4 3.9.94 5.5L10 13.47l-4.94 2.64.94-5.5-4-3.9 5.61-.87z"
                  fill="currentColor"
                  clip-path="url(#star-clip-{star})"
                />
                <path
                  d="M10 1l2.39 4.84L18 6.71l-4 3.9.94 5.5L10 13.47l-4.94 2.64.94-5.5-4-3.9 5.61-.87z"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1"
                />
              </svg>
            {/each}
          </div>
          <p class="mt-2 text-sm text-gray-500">
            {data.rating.count}
            {data.rating.count === 1 ? "review" : "reviews"}
          </p>
        </div>

        <!-- Right column: individual reviews -->
        <div class="divide-y divide-gray-100">
          {#each data.reviews as review}
            <div class="grid grid-cols-1 gap-10 py-4 first:pt-0 sm:grid-cols-[180px_1fr] sm:gap-6">
              <!-- Reviewer info -->
              <div>
                <p class="text-sm font-medium text-gray-900">{review.nickname}</p>
                {#if review.isVerifiedPurchase}
                  <p class="text-xs text-green-600">Verified buyer</p>
                {/if}
                <div class="flex gap-0.5 text-amber-400">
                  {#each [1, 2, 3, 4, 5] as star}
                    <span class="text-xl">{star <= review.rating ? "★" : "☆"}</span>
                  {/each}
                </div>
                <p class="text-xs text-gray-400">{formatDate(review.createdAt)}</p>
              </div>

              <!-- Comment -->
              <div>
                {#if review.comment}
                  <p class="text-sm text-gray-700">{review.comment}</p>
                {/if}
              </div>
            </div>
          {/each}
        </div>
      </div>
    {/if}
  </div>

  <!-- Related Products -->
  {#if data.relatedProducts.length > 0}
    <section class="mt-8 border-t border-gray-200 pt-8">
      <h2 class="mb-6 text-xl font-bold">You May Also Like</h2>
      <div class="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {#each data.relatedProducts as relatedProduct}
          <ProductCard product={relatedProduct} activeDiscounts={data.activeDiscounts} />
        {/each}
      </div>
    </section>
  {/if}
</div>
