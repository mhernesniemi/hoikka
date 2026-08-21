<script lang="ts">
  import { STORE_NAME } from "@hoikka/core/config/derived";
  import type { PageData } from "./$types";
  import ProductCard from "$lib/components/storefront/ProductCard.svelte";
  import ArrowRightIcon from "@lucide/svelte/icons/arrow-right";

  let { data }: { data: PageData } = $props();
</script>

<svelte:head>
  <title>{STORE_NAME}</title>
  <meta name="description" content="Welcome to {STORE_NAME}." />
</svelte:head>

<div class="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
  <section>
    <div class="mb-8 flex items-baseline justify-between">
      <h1 class="text-2xl font-bold">Featured products</h1>
      <a
        href="/products"
        class="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline"
        >View all <ArrowRightIcon class="h-4 w-4" /></a
      >
    </div>

    {#if data.featuredProducts.length === 0}
      <div class="py-16 text-center text-gray-500">
        <p>No products yet.</p>
        <a href="/admin" class="text-blue-600 hover:underline">
          Add your first product in the admin
        </a>
      </div>
    {:else}
      <div
        class="grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-4"
        data-sveltekit-preload-data="viewport"
      >
        {#each data.featuredProducts as product (product.id)}
          <ProductCard
            {product}
            activeDiscounts={data.activeDiscounts}
            loading="eager"
            sizes="(max-width: 640px) 50vw, 25vw"
          />
        {/each}
      </div>
    {/if}
  </section>
</div>
