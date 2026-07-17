<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { cn, getCurrencySymbol } from "$lib/utils";
  import { SelectNative } from "$lib/components/storefront/ui/select-native";
  import ProductCard from "$lib/components/storefront/ProductCard.svelte";
  import type { ListingResult } from "$lib/server/services/product-search";
  import {
    PRODUCT_SORT_OPTIONS,
    type CachedProduct,
    type FacetWithValues,
    type ProductSortKey,
    type ProductWithRelations
  } from "$lib/types";
  import type { ActiveDiscount } from "$lib/promotion-utils";
  import Check from "@lucide/svelte/icons/check";
  import SlidersHorizontal from "@lucide/svelte/icons/sliders-horizontal";
  import X from "@lucide/svelte/icons/x";

  let mobileFiltersOpen = $state(false);

  // The listing is computed server-side (FTS5) by the page load from the URL
  // params; this component renders it and builds filter/sort/page URLs.
  let {
    facets,
    listing,
    activeDiscounts = [],
    basePath = "/products"
  }: {
    facets: FacetWithValues[];
    listing: ListingResult;
    activeDiscounts?: ActiveDiscount[];
    basePath?: string;
  } = $props();

  // Parse URL params reactively (display state only — filtering happens server-side)
  const search = $derived(page.url.searchParams.get("q") ?? undefined);
  const currentPage = $derived(Number(page.url.searchParams.get("page")) || 1);
  const sortKey = $derived((page.url.searchParams.get("sort") as ProductSortKey) || "newest");

  const activeFilters = $derived.by(() => {
    const filters: Record<string, string[]> = {};
    for (const [key, value] of page.url.searchParams.entries()) {
      if (key.startsWith("facet_")) {
        const facetCode = key.replace("facet_", "");
        if (!filters[facetCode]) {
          filters[facetCode] = [];
        }
        filters[facetCode].push(value);
      }
    }
    return filters;
  });

  const hasActiveFilters = $derived(
    Object.keys(activeFilters).length > 0 ||
      page.url.searchParams.has("price_min") ||
      page.url.searchParams.has("price_max")
  );

  const priceRange = $derived(listing.priceRange);
  const baseFacetCounts = $derived(listing.baseFacetCounts);
  const facetCounts = $derived(listing.facetCounts);

  const totalPages = $derived(Math.ceil(listing.pagination.total / listing.pagination.limit));

  // Convert CachedProduct → ProductWithRelations for ProductCard
  function toProductCard(cached: CachedProduct): ProductWithRelations {
    // Swap image when a variant-level filter is active
    let effectiveAsset = cached.featuredAsset;
    if (hasActiveFilters && cached.variantFacetImages) {
      outer: for (const [facetCode, valueCodes] of Object.entries(activeFilters)) {
        const facetImages = cached.variantFacetImages[facetCode];
        if (!facetImages) continue;
        for (const code of valueCodes) {
          if (facetImages[code]) {
            effectiveAsset = { source: facetImages[code], focalX: 0.5, focalY: 0.5 };
            break outer;
          }
        }
      }
    }

    const featuredAsset = effectiveAsset
      ? {
          id: 0,
          name: "",
          type: "image" as const,
          mimeType: "image/jpeg",
          width: 0,
          height: 0,
          fileSize: 0,
          source: effectiveAsset.source,
          alt: null,
          focalX: effectiveAsset.focalX,
          focalY: effectiveAsset.focalY,
          createdAt: new Date()
        }
      : null;

    return {
      id: cached.id,
      name: cached.name,
      slug: cached.slug,
      description: cached.description,
      type: "physical",
      visibility: "public",
      taxCode: "standard",
      featuredAssetId: featuredAsset ? 0 : null,
      deletedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      variants:
        cached.minPrice !== null
          ? [
              {
                id: 0,
                productId: cached.id,
                name: null,
                sku: "",
                price: cached.minPrice,
                stock: cached.inStock ? 1 : 0,
                trackInventory: true,
                featuredAssetId: null,
                imageUrl: null,
                isFeatured: false,
                deletedAt: null,
                createdAt: new Date(),
                updatedAt: new Date(),
                facetValues: [],
                assets: [],
                featuredAsset: null
              }
            ]
          : [],
      facetValues: [],
      assets: [],
      featuredAsset
    };
  }

  function isFilterActive(facetCode: string, valueCode: string): boolean {
    return activeFilters[facetCode]?.includes(valueCode) ?? false;
  }

  function getFilterUrl(facetCode: string, valueCode: string, add: boolean): string {
    const params = new URLSearchParams(page.url.searchParams);

    if (add) {
      params.append(`facet_${facetCode}`, valueCode);
    } else {
      const values = params.getAll(`facet_${facetCode}`).filter((v) => v !== valueCode);
      params.delete(`facet_${facetCode}`);
      values.forEach((v) => params.append(`facet_${facetCode}`, v));
    }

    params.delete("page");

    const paramString = params.toString();
    return paramString ? `?${paramString}` : basePath;
  }

  function clearAllFilters(): string {
    const params = new URLSearchParams();
    if (search) {
      params.set("q", search);
    }
    const paramString = params.toString();
    return paramString ? `?${paramString}` : basePath;
  }

  function applyPriceFilter(form: HTMLFormElement) {
    const data = new FormData(form);
    const min = (data.get("price_min") as string)?.trim();
    const max = (data.get("price_max") as string)?.trim();
    const params = new URLSearchParams(page.url.searchParams);

    if (min && Number(min) > 0) {
      params.set("price_min", min);
    } else {
      params.delete("price_min");
    }
    if (max && Number(max) > 0) {
      params.set("price_max", max);
    } else {
      params.delete("price_max");
    }
    params.delete("page");

    const paramString = params.toString();
    goto(paramString ? `?${paramString}` : basePath, { keepFocus: true, noScroll: true });
  }

  function getSortUrl(sort: string): string {
    const params = new URLSearchParams(page.url.searchParams);
    if (sort === "newest") {
      params.delete("sort");
    } else {
      params.set("sort", sort);
    }
    params.delete("page");
    const paramString = params.toString();
    return paramString ? `?${paramString}` : basePath;
  }

  function getPageUrl(pageNum: number): string {
    const params = new URLSearchParams(page.url.searchParams);
    if (pageNum <= 1) {
      params.delete("page");
    } else {
      params.set("page", String(pageNum));
    }
    const paramString = params.toString();
    return paramString ? `?${paramString}` : basePath;
  }
</script>

<!-- Toolbar: Clear filters + Sort -->
<div
  class="mb-4 flex items-center justify-between gap-2"
  data-sveltekit-keepfocus
  data-sveltekit-noscroll
>
  <div class="flex items-center gap-3">
    <!-- Mobile filter toggle -->
    <button
      type="button"
      class="inline-flex items-center gap-1.5 rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 md:hidden"
      onclick={() => (mobileFiltersOpen = !mobileFiltersOpen)}
    >
      <SlidersHorizontal class="h-4 w-4" />
      Filters
    </button>
    {#if search}
      <span class="text-sm text-gray-500">
        Results for "<span class="font-medium text-gray-900">{search}</span>"
      </span>
      <a href={basePath} class="text-sm text-blue-600 hover:underline">Clear search</a>
    {/if}
    {#if hasActiveFilters}
      <a href={clearAllFilters()} class="text-sm text-blue-600 hover:underline">
        Clear all filters
      </a>
    {/if}
  </div>
  <SelectNative
    value={sortKey}
    onchange={(e) => {
      goto(getSortUrl(e.currentTarget.value), { keepFocus: true, noScroll: true });
    }}
  >
    {#each PRODUCT_SORT_OPTIONS as option}
      <option value={option.value}>{option.label}</option>
    {/each}
  </SelectNative>
</div>

<!-- Mobile filter overlay -->
{#if mobileFiltersOpen}
  <div class="fixed inset-0 z-40 bg-black/30 md:hidden" role="presentation">
    <button
      class="h-full w-full"
      onclick={() => (mobileFiltersOpen = false)}
      aria-label="Close filters"
    ></button>
  </div>
{/if}

<div class="flex flex-col gap-8 md:flex-row">
  <!-- Sidebar Filters -->
  <aside
    class={cn(
      "shrink-0 md:relative md:block md:w-64",
      mobileFiltersOpen
        ? "fixed inset-y-0 left-0 z-50 w-72 overflow-y-auto bg-white p-6 shadow-lg"
        : "hidden md:block"
    )}
    data-sveltekit-keepfocus
    data-sveltekit-noscroll
  >
    <!-- Mobile filter header -->
    <div class="mb-4 flex items-center justify-between md:hidden">
      <h2 class="text-lg font-semibold">Filters</h2>
      <button
        type="button"
        class="text-gray-500 hover:text-gray-900"
        onclick={() => (mobileFiltersOpen = false)}
      >
        <X class="h-5 w-5" />
      </button>
    </div>
    <!-- Price Range Filter -->
    {#if priceRange && priceRange.min !== priceRange.max}
      <div class="mb-6">
        <h3 class="mb-3 font-semibold">Price ({getCurrencySymbol("EUR")})</h3>
        <form
          class="flex items-center gap-2"
          onsubmit={(e) => {
            e.preventDefault();
            applyPriceFilter(e.currentTarget);
          }}
        >
          <input
            type="number"
            name="price_min"
            placeholder={String(Math.floor(priceRange.min / 100))}
            value={page.url.searchParams.get("price_min") ?? ""}
            oninput={(e) => applyPriceFilter(e.currentTarget.form!)}
            min="0"
            step="any"
            class="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm text-gray-700 placeholder:text-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
          />
          <span class="text-gray-400">–</span>
          <input
            type="number"
            name="price_max"
            placeholder={String(Math.ceil(priceRange.max / 100))}
            value={page.url.searchParams.get("price_max") ?? ""}
            oninput={(e) => applyPriceFilter(e.currentTarget.form!)}
            min="0"
            step="any"
            class="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm text-gray-700 placeholder:text-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
          />
        </form>
      </div>
    {/if}

    <!-- Facet Filters -->
    {#each facets as facet (facet.id)}
      {@const baseMap = new Map(
        (baseFacetCounts[facet.code] ?? []).map((v) => [v.valueCode, v.count])
      )}
      {@const countsMap = new Map(
        (facetCounts[facet.code] ?? []).map((v) => [v.valueCode, v.count])
      )}
      {@const relevantValues = facet.values.filter(
        (v) => (baseMap.get(v.code) ?? 0) > 0 || isFilterActive(facet.code, v.code)
      )}
      {#if relevantValues.length > 0}
        <div class="mb-6">
          <h3 class="mb-3 font-semibold">{facet.name}</h3>
          <div class="space-y-2">
            {#each relevantValues as value}
              {@const count = countsMap.get(value.code) ?? 0}
              {@const active = isFilterActive(facet.code, value.code)}
              {@const disabled = count === 0 && !active}
              {#if disabled}
                <span
                  class="flex cursor-default items-center justify-between text-sm text-gray-300"
                >
                  <span class="flex items-center gap-2">
                    <span
                      class="flex h-4 w-4 items-center justify-center rounded border border-gray-200"
                    ></span>
                    {value.name}
                  </span>
                  <span>(0)</span>
                </span>
              {:else}
                <a
                  href={getFilterUrl(facet.code, value.code, !active)}
                  class={cn(
                    "flex items-center justify-between text-sm",
                    active ? "font-medium text-blue-600" : "text-gray-600 hover:text-gray-900"
                  )}
                >
                  <span class="flex items-center gap-2">
                    <span
                      class={cn(
                        "flex h-4 w-4 items-center justify-center rounded border",
                        active ? "border-blue-600 bg-blue-600" : "border-gray-300"
                      )}
                    >
                      {#if active}
                        <Check class="h-3 w-3 text-white" />
                      {/if}
                    </span>
                    {value.name}
                  </span>
                  <span class="text-gray-400">({count})</span>
                </a>
              {/if}
            {/each}
          </div>
        </div>
      {/if}
    {/each}
  </aside>

  <!-- Products Grid -->
  <div class="flex-1">
    {#if listing.items.length === 0}
      <div class="py-12 text-center text-gray-500">
        {#if search}
          <p>No products found for "<span class="font-medium text-gray-900">{search}</span>"</p>
          <a href={basePath} class="mt-2 inline-block text-blue-600 hover:underline">
            Clear search
          </a>
        {:else}
          <p>No products found matching your criteria.</p>
        {/if}
        {#if hasActiveFilters}
          <a href={clearAllFilters()} class="mt-2 inline-block text-blue-600 hover:underline">
            Clear filters
          </a>
        {/if}
      </div>
    {:else}
      <!-- viewport preload: card data is fetched as cards scroll into view,
           so clicking renders from memory (pages are edge-cached anyway) -->
      <div
        class="grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-3"
        data-sveltekit-preload-data="viewport"
      >
        {#each listing.items as product (product.id)}
          <ProductCard
            product={toProductCard(product)}
            {activeDiscounts}
            showFromPrice={product.minPrice !== null &&
              product.maxPrice !== null &&
              product.minPrice !== product.maxPrice}
          />
        {/each}
      </div>

      <!-- Pagination -->
      {#if totalPages > 1}
        <div class="mt-8 flex justify-center gap-2">
          {#if currentPage > 1}
            <a
              href={getPageUrl(currentPage - 1)}
              class="inline-flex h-10 items-center justify-center rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-900 hover:bg-gray-50"
            >
              Previous
            </a>
          {/if}
          <span class="px-4 py-2 text-gray-500">
            Page {currentPage} of {totalPages}
          </span>
          {#if currentPage < totalPages}
            <a
              href={getPageUrl(currentPage + 1)}
              class="inline-flex h-10 items-center justify-center rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-900 hover:bg-gray-50"
            >
              Next
            </a>
          {/if}
        </div>
      {/if}
    {/if}
  </div>
</div>
