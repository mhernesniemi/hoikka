<script lang="ts">
  import { goto } from "$app/navigation";
  import { formatPrice } from "$lib/utils";
  import { imageUrl } from "$lib/image";
  import { quickSearch } from "$lib/remote/search.remote";
  import * as Command from "$lib/components/storefront/ui/command/index.js";

  let searchQuery = $state("");
  let debouncedQuery = $state("");
  let showResults = $state(false);
  let containerEl = $state<HTMLDivElement | null>(null);

  // Debounce keystrokes before hitting the server FTS query
  $effect(() => {
    const q = searchQuery.trim();
    const timer = setTimeout(() => (debouncedQuery = q), 150);
    return () => clearTimeout(timer);
  });

  const activeQuery = $derived(debouncedQuery ? quickSearch(debouncedQuery) : null);

  // Hold the previous term's results while the next term's query is in
  // flight — swapping to [] mid-flight flashes "No products found"
  let searchResults = $state<NonNullable<ReturnType<typeof quickSearch>["current"]>>([]);
  $effect(() => {
    if (!debouncedQuery) {
      searchResults = [];
      return;
    }
    const current = activeQuery?.current;
    if (current !== undefined) searchResults = current;
  });

  // "No products found" only for a settled result of what's actually typed
  const settledEmpty = $derived(
    searchResults.length === 0 &&
      activeQuery?.current !== undefined &&
      debouncedQuery === searchQuery.trim()
  );

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
  <Command.Root shouldFilter={false} class="rounded-lg border border-gray-300 ">
    <Command.Input
      class="placeholder:text-gray-500"
      placeholder="Search products..."
      bind:value={searchQuery}
      onfocus={() => (showResults = true)}
    />
    <!-- Mounted only once there is something to show — an empty bordered
         container collapses into a stray 1px line under the input -->
    {#if showResults && searchQuery.length >= 1 && (searchResults.length > 0 || settledEmpty)}
      <div
        class="absolute top-full right-0 left-0 z-50 mt-1 rounded-lg border border-gray-200 bg-white shadow-lg"
      >
        <Command.List class="max-h-96">
          {#if settledEmpty}
            <Command.Empty>No products found</Command.Empty>
          {/if}
          {#each searchResults as product (product.id)}
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
                <p class="text-sm text-gray-500">{formatPrice(product.price ?? 0)}</p>
              </div>
            </Command.LinkItem>
          {/each}
        </Command.List>
      </div>
    {/if}
  </Command.Root>
</div>
