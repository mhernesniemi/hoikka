<script lang="ts">
  import { page } from "$app/stores";
  import { cn } from "$lib/utils";
  import { Input } from "$lib/components/storefront/ui/input";
  import { Button } from "$lib/components/storefront/ui/button";
  import ProductCard from "$lib/components/storefront/ProductCard.svelte";
  import type { PageData } from "./$types";
  import Check from "@lucide/svelte/icons/check";

  let { data }: { data: PageData } = $props();

  const pageTitle = $derived(data.search ? `Search: ${data.search} | Hoikka` : "Products | Hoikka");

  function isFilterActive(facetCode: string, valueCode: string): boolean {
    return data.activeFilters[facetCode]?.includes(valueCode) ?? false;
  }

  function getFilterUrl(facetCode: string, valueCode: string, add: boolean): string {
    const params = new URLSearchParams($page.url.searchParams);

    if (add) {
      params.append(`facet_${facetCode}`, valueCode);
    } else {
      // Remove this specific value
      const values = params.getAll(`facet_${facetCode}`).filter((v) => v !== valueCode);
      params.delete(`facet_${facetCode}`);
      values.forEach((v) => params.append(`facet_${facetCode}`, v));
    }

    // Reset to page 1 when changing filters
    params.delete("page");

    const paramString = params.toString();
    return paramString ? `?${paramString}` : "/products";
  }

  function clearAllFilters(): string {
    const params = new URLSearchParams();
    if (data.search) {
      params.set("q", data.search);
    }
    const paramString = params.toString();
    return paramString ? `?${paramString}` : "/products";
  }

  const hasActiveFilters = $derived(Object.keys(data.activeFilters).length > 0);
</script>

<svelte:head>
  <title>{pageTitle}</title>
  <meta
    name="description"
    content="Browse our collection of products. Filter by category, brand, and more."
  />
  <meta property="og:title" content={pageTitle} />
  <meta
    property="og:description"
    content="Browse our collection of products. Filter by category, brand, and more."
  />
  <meta property="og:type" content="website" />
</svelte:head>

<div class="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
  <h1 class="mb-8 text-2xl font-bold">Products</h1>

  <div class="flex gap-8">
    <!-- Sidebar Filters -->
    <aside class="w-64 shrink-0" data-sveltekit-keepfocus data-sveltekit-noscroll>
      <!-- Search -->
      <form method="GET" class="mb-6">
        <Input type="text" name="q" value={data.search ?? ""} placeholder="Search products..." />
      </form>

      {#if hasActiveFilters}
        <div class="mb-6">
          <a href={clearAllFilters()} class="text-sm text-blue-600 hover:underline">
            Clear all filters
          </a>
        </div>
      {/if}

      <!-- Facet Filters -->
      {#each data.facets as facet}
        {@const counts = data.facetCounts[facet.code] ?? []}
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
    </aside>

    <!-- Products Grid -->
    <div class="flex-1">
      {#if data.products.length === 0}
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
          {#each data.products as product}
            <ProductCard {product} activeDiscounts={data.activeDiscounts} />
          {/each}
        </div>

        <!-- Pagination -->
        {#if data.pagination.total > data.pagination.limit}
          <div class="mt-8 flex justify-center gap-2">
            {#if data.currentPage > 1}
              <a
                href="?page={data.currentPage - 1}"
                class="inline-flex h-10 items-center justify-center rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-900 hover:bg-gray-50"
              >
                Previous
              </a>
            {/if}
            <span class="px-4 py-2 text-gray-500">
              Page {data.currentPage} of {Math.ceil(data.pagination.total / data.pagination.limit)}
            </span>
            {#if data.pagination.hasMore}
              <a
                href="?page={data.currentPage + 1}"
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
</div>
