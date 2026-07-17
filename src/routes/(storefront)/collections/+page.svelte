<script lang="ts">
  import FolderOpen from "@lucide/svelte/icons/folder-open";

  let { data } = $props();
</script>

<svelte:head>
  <title>Collections | Hoikka</title>
  <meta name="description" content="Browse our curated collections of products." />
  <meta property="og:title" content="Collections | Hoikka" />
  <meta property="og:description" content="Browse our curated collections of products." />
  <meta property="og:type" content="website" />
</svelte:head>

<div class="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
  <h1 class="mb-8 text-3xl font-bold text-gray-900">Collections</h1>

  {#if data.collections.length === 0}
    <div class="py-16 text-center">
      <FolderOpen class="mx-auto h-12 w-12 text-gray-400" />
      <h3 class="mt-4 text-lg font-medium text-gray-900">No collections available</h3>
      <p class="mt-2 text-gray-500">
        <a href="/products" class="text-blue-600 hover:text-blue-700">View all products</a>
      </p>
    </div>
  {:else}
    <div class="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {#each data.collections as collection}
        <a
          href="/collections/{collection.id}/{collection.slug}"
          class="group rounded-lg border border-gray-200 bg-white p-6 shadow-sm transition-shadow hover:shadow-md"
        >
          <div class="flex items-center gap-3">
            <FolderOpen class="h-8 w-8 text-gray-400" />
            <div>
              <h2 class="text-lg font-semibold text-gray-900 group-hover:text-blue-600">
                {collection.name}
              </h2>
              <p class="text-sm text-gray-500">
                {collection.productCount} products
              </p>
            </div>
          </div>
          {#if collection.description}
            <div class="prose prose-sm mt-3 line-clamp-2 max-w-none prose-gray">
              <!-- eslint-disable-next-line svelte/no-at-html-tags -- sanitized on save in admin -->
              {@html collection.description}
            </div>
          {/if}
        </a>
      {/each}
    </div>
  {/if}
</div>
