<script lang="ts">
  import type { PageData } from "./$types";
  import ProductListing from "$lib/components/storefront/ProductListing.svelte";

  let { data }: { data: PageData } = $props();

  function buildCategoryPath(breadcrumbs: typeof data.breadcrumbs, upToIndex: number): string {
    return (
      "/category/" +
      breadcrumbs
        .slice(0, upToIndex + 1)
        .map((b) => b.slug)
        .join("/")
    );
  }

  const basePath = `/category/${data.breadcrumbs.map((b) => b.slug).join("/")}`;
</script>

<svelte:head>
  <title>{data.category.name} | Hoikka</title>
  <meta
    name="description"
    content="Browse {data.category.name} products. Find the best selection at Hoikka."
  />
  <meta property="og:title" content="{data.category.name} | Hoikka" />
  <meta
    property="og:description"
    content="Browse {data.category.name} products. Find the best selection at Hoikka."
  />
  <meta property="og:type" content="website" />
</svelte:head>

<div class="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
  <!-- Breadcrumbs -->
  <nav class="mb-6">
    <ol class="flex items-center gap-2 text-sm">
      <li>
        <a href="/" class="text-gray-500 hover:text-gray-700">Home</a>
      </li>
      {#each data.breadcrumbs as crumb, index}
        <li class="flex items-center gap-2">
          <span class="text-gray-400">/</span>
          {#if index === data.breadcrumbs.length - 1}
            <span class="font-medium text-gray-900">{crumb.name}</span>
          {:else}
            <a
              href={buildCategoryPath(data.breadcrumbs, index)}
              class="text-gray-500 hover:text-gray-700"
            >
              {crumb.name}
            </a>
          {/if}
        </li>
      {/each}
    </ol>
  </nav>

  <!-- Category Header -->
  <div class="mb-4">
    <h1 class="text-3xl font-bold text-gray-900">{data.category.name}</h1>
  </div>

  <!-- Subcategories -->
  {#if data.children.length > 0}
    <div class="mb-8">
      <h2 class="mb-4 text-lg font-semibold text-gray-900">Subcategories</h2>
      <div class="flex flex-wrap gap-3">
        {#each data.children as child}
          <a
            href="/category/{data.breadcrumbs.map((b) => b.slug).join('/')}/{child.slug}"
            class="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:border-gray-300 hover:bg-gray-50"
          >
            {child.name}
          </a>
        {/each}
      </div>
    </div>
  {/if}

  <ProductListing
    facets={data.facets}
    activeDiscounts={data.activeDiscounts}
    productIds={data.productIds}
    {basePath}
  />
</div>
