<script lang="ts">
  import { page } from "$app/stores";
  import { cn } from "$lib/utils";
  import { Input } from "$lib/components/storefront/ui/input";
  import ProductCard from "$lib/components/storefront/ProductCard.svelte";
  import { productStore } from "$lib/stores/products.svelte";
  import type { CachedProduct, FacetWithValues, ProductWithRelations } from "$lib/types";
  import type { ActiveDiscount } from "$lib/promotion-utils";
  import Check from "@lucide/svelte/icons/check";

  let {
    facets,
    activeDiscounts = [],
    productIds,
    basePath = "/products"
  }: {
    facets: FacetWithValues[];
    activeDiscounts?: ActiveDiscount[];
    productIds?: number[];
    basePath?: string;
  } = $props();

  const limit = 12;

  // Parse URL params reactively
  const search = $derived($page.url.searchParams.get("q") ?? undefined);
  const currentPage = $derived(Number($page.url.searchParams.get("page")) || 1);

  const activeFilters = $derived.by(() => {
    const filters: Record<string, string[]> = {};
    for (const [key, value] of $page.url.searchParams.entries()) {
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

  const hasActiveFilters = $derived(Object.keys(activeFilters).length > 0);

  // Derive filtered products from store
  const searchResult = $derived(
    productStore.loaded
      ? productStore.search({
          productIds,
          search,
          facets: hasActiveFilters ? activeFilters : undefined,
          page: currentPage,
          limit
        })
      : { items: [], total: 0 }
  );

  const facetCounts = $derived(
    productStore.loaded
      ? productStore.getFacetCounts({
          productIds,
          search,
          facets: hasActiveFilters ? activeFilters : undefined
        })
      : {}
  );

  const totalPages = $derived(Math.ceil(searchResult.total / limit));

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
            effectiveAsset = { source: facetImages[code], focalX: "0.5", focalY: "0.5" };
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
    const params = new URLSearchParams($page.url.searchParams);

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

  function getPageUrl(pageNum: number): string {
    const params = new URLSearchParams($page.url.searchParams);
    if (pageNum <= 1) {
      params.delete("page");
    } else {
      params.set("page", String(pageNum));
    }
    const paramString = params.toString();
    return paramString ? `?${paramString}` : basePath;
  }
</script>

<div class="flex flex-col gap-8 md:flex-row">
  <!-- Sidebar Filters -->
  <aside class="w-full shrink-0 md:w-64" data-sveltekit-keepfocus data-sveltekit-noscroll>
    <!-- Search -->
    <form method="GET" class="mb-6">
      <Input type="text" name="q" value={search ?? ""} placeholder="Search products..." />
    </form>

    {#if hasActiveFilters}
      <div class="mb-6">
        <a href={clearAllFilters()} class="text-sm text-blue-600 hover:underline">
          Clear all filters
        </a>
      </div>
    {/if}

    <!-- Facet Filters -->
    {#if productStore.loaded}
      {#each facets as facet}
        {@const counts = facetCounts[facet.code] ?? []}
        {#if counts.length > 0}
          <div class="mb-6">
            <h3 class="mb-3 font-semibold">{facet.name}</h3>
            <div class="space-y-2">
              {#each counts as value}
                {@const active = isFilterActive(facet.code, value.code)}
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
                  <span class="text-gray-400">({value.count})</span>
                </a>
              {/each}
            </div>
          </div>
        {/if}
      {/each}
    {/if}
  </aside>

  <!-- Products Grid -->
  <div class="flex-1">
    {#if !productStore.loaded}
      <!-- Skeleton grid while cache streams in -->
      <div class="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {#each Array(6) as _}
          <div class="animate-pulse overflow-hidden rounded-lg border border-gray-200">
            <div class="aspect-square bg-gray-200"></div>
            <div class="p-4">
              <div class="h-4 w-3/4 rounded bg-gray-200"></div>
              <div class="mt-2 h-4 w-1/4 rounded bg-gray-200"></div>
            </div>
          </div>
        {/each}
      </div>
    {:else if searchResult.items.length === 0}
      <div class="py-12 text-center text-gray-500">
        <p>No products found matching your criteria.</p>
        {#if hasActiveFilters}
          <a href={clearAllFilters()} class="mt-2 inline-block text-blue-600 hover:underline">
            Clear filters
          </a>
        {/if}
      </div>
    {:else}
      <div class="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {#each searchResult.items as product (product.id)}
          <ProductCard product={toProductCard(product)} {activeDiscounts} />
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
