<script lang="ts">
  import { STORE_NAME } from "$lib/config/store.js";
  import ProductListing from "$lib/components/storefront/ProductListing.svelte";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();

  const pageTitle = `Products | ${STORE_NAME}`;
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
  <h1 class="mb-4 text-2xl font-bold">Products</h1>
  <ProductListing
    facets={data.facets}
    listing={data.listing}
    activeDiscounts={data.activeDiscounts}
  />
</div>
