<script lang="ts">
  import { goto } from "$app/navigation";
  import { formatPrice } from "$lib/utils";
  import { imageUrl } from "$lib/image";
  import * as Command from "$lib/components/storefront/ui/command/index.js";

  interface SearchProduct {
    id: number;
    name: string;
    slug: string;
    price: number;
    image: string | null;
  }

  let { products }: { products: SearchProduct[] } = $props();

  let searchQuery = $state("");
  let showResults = $state(false);
  let containerEl = $state<HTMLDivElement | null>(null);

  function handleSelect() {
    searchQuery = "";
    showResults = false;
  }

  function handleClickOutside(event: MouseEvent) {
    if (containerEl && !containerEl.contains(event.target as Node)) {
      showResults = false;
    }
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      showResults = false;
    }
    if (event.key === "Enter" && !showResults && searchQuery.length >= 1) {
      goto(`/products?q=${encodeURIComponent(searchQuery)}`);
      searchQuery = "";
    }
  }
</script>

<svelte:document onclick={handleClickOutside} onkeydown={handleKeydown} />

<div class="relative mx-4 max-w-md flex-1" bind:this={containerEl}>
  <Command.Root class="rounded-lg border border-gray-300 ">
    <Command.Input
      class="placeholder:text-gray-500"
      placeholder="Search products..."
      bind:value={searchQuery}
      onfocus={() => (showResults = true)}
    />
    {#if showResults && searchQuery.length >= 1}
      <div
        class="absolute top-full right-0 left-0 z-50 mt-1 rounded-lg border border-gray-200 bg-white shadow-lg"
      >
        <Command.List class="max-h-96">
          <Command.Empty>No products found</Command.Empty>
          {#each products as product (product.id)}
            <Command.LinkItem
              value={product.name}
              href="/products/{product.id}/{product.slug}"
              onSelect={handleSelect}
              class="flex items-center gap-3 px-4 py-3"
            >
              {#if product.image}
                <img
                  src={imageUrl(product.image, 100)}
                  alt=""
                  class="h-10 w-10 rounded object-cover"
                />
              {:else}
                <div class="h-10 w-10 rounded bg-gray-100"></div>
              {/if}
              <div class="min-w-0 flex-1">
                <p class="truncate text-sm font-medium text-gray-900">{product.name}</p>
                <p class="text-sm text-gray-500">{formatPrice(product.price)}</p>
              </div>
            </Command.LinkItem>
          {/each}
        </Command.List>
      </div>
    {/if}
  </Command.Root>
</div>
