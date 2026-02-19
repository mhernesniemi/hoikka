<script lang="ts">
  import ProductListing from "$lib/components/storefront/ProductListing.svelte";
  import { stripHtml } from "$lib/utils";

  let { data } = $props();

  const basePath = `/collections/${data.collection.id}/${data.collection.slug}`;
</script>

<svelte:head>
  <title>{data.collection.name} | Hoikka</title>
  <meta
    name="description"
    content={stripHtml(data.collection.description)?.slice(0, 160) ||
      `Browse our ${data.collection.name} collection.`}
  />
  <meta property="og:title" content="{data.collection.name} | Hoikka" />
  <meta
    property="og:description"
    content={stripHtml(data.collection.description)?.slice(0, 160) ||
      `Browse our ${data.collection.name} collection.`}
  />
  <meta property="og:type" content="website" />
</svelte:head>

<div class="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
  <!-- Collection Header -->
  <div class="mb-8">
    <nav class="mb-4">
      <a href="/collections" class="text-sm text-gray-500 hover:text-gray-700">
        &larr; Back to Collections
      </a>
    </nav>

    <h1 class="text-3xl font-bold text-gray-900">{data.collection.name}</h1>
    {#if data.collection.description}
      <div class="prose prose-lg mt-2 max-w-none prose-gray">
        {@html data.collection.description}
      </div>
    {/if}
  </div>

  <ProductListing
    facets={data.facets}
    activeDiscounts={data.activeDiscounts}
    productIds={data.productIds}
    {basePath}
  />
</div>
