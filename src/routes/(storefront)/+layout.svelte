<script lang="ts">
  import { invalidateAll, onNavigate } from "$app/navigation";
  import { page } from "$app/stores";
  import { cn } from "$lib/utils";
  import SearchBar from "$lib/components/storefront/SearchBar.svelte";
  import CartSheet from "$lib/components/storefront/CartSheet.svelte";
  import { cartStore } from "$lib/stores/cart.svelte";
  import { wishlistStore } from "$lib/stores/wishlist.svelte";
  import { productStore } from "$lib/stores/products.svelte";
  import type { LayoutData } from "./$types";
  import Heart from "@lucide/svelte/icons/heart";
  import Dot from "@lucide/svelte/icons/dot";
  import UserIcon from "@lucide/svelte/icons/user";
  import SearchIcon from "@lucide/svelte/icons/search";
  import X from "@lucide/svelte/icons/x";

  let mobileSearchOpen = $state(false);

  // Enable view transition only when navigating to admin
  onNavigate((navigation) => {
    if (!document.startViewTransition) return;
    if (!navigation.to?.url.pathname.startsWith("/admin")) return;

    return new Promise((resolve) => {
      document.startViewTransition(async () => {
        resolve();
        await navigation.complete;
      });
    });
  });

  let { children, data }: { children: any; data: LayoutData } = $props();

  let previousUserId: string | null | undefined = undefined;

  // Invalidate data when auth state changes (sign in/out)
  $effect(() => {
    const currentUserId = data.user?.id ?? null;
    if (previousUserId !== undefined && previousUserId !== currentUserId) {
      invalidateAll();
    }
    previousUserId = currentUserId;
  });

  // Sync server data to stores for optimistic updates
  $effect(() => {
    cartStore.sync(data.cart);
  });

  $effect(() => {
    wishlistStore.sync(data.wishlistCount);
  });

  $effect(() => {
    data.cachedProducts.then((products) => productStore.sync(products));
  });

  const wishlistCount = $derived.by(() => wishlistStore.count);
</script>

<div class="flex min-h-screen flex-col bg-white">
  <!-- Header (hidden on front page) -->
  {#if $page.url.pathname !== "/"}
    <header class="sticky top-0 z-50 bg-white/95 backdrop-blur-sm">
      <div class="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div class="flex h-16 items-center justify-between gap-2">
          <a href="/" class="shrink-0 bg-[#f7d0dd] text-xl font-bold text-gray-900">"Hoikka"</a>

          <!-- Desktop search -->
          <div class="hidden flex-1 items-center justify-center sm:flex">
            <SearchBar />
          </div>

          <nav class="flex items-center gap-4 sm:gap-6">
            <!-- Mobile search toggle -->
            <button
              type="button"
              class="text-gray-600 hover:text-gray-900 sm:hidden"
              onclick={() => (mobileSearchOpen = !mobileSearchOpen)}
              aria-label="Search"
            >
              {#if mobileSearchOpen}
                <X class="h-6 w-6" />
              {:else}
                <SearchIcon class="h-6 w-6" />
              {/if}
            </button>

            <a
              href="/wishlist"
              class={cn(
                "group relative text-gray-600 transition-opacity hover:text-gray-900",
                wishlistCount > 0 ? "opacity-100" : "pointer-events-none opacity-0"
              )}
              aria-label="Wishlist"
            >
              <Heart class="h-6 w-6" />
              <span
                class="absolute -top-2 -right-2 flex h-5 w-5 items-center justify-center rounded-full bg-gray-500 text-xs text-white group-hover:bg-red-500"
              >
                {wishlistCount}
              </span>
            </a>

            {#if data.user}
              <a href="/account"><UserIcon class="h-6 w-6" /></a>
            {:else}
              <a href="/sign-in"><UserIcon class="h-6 w-6" /></a>
            {/if}

            <CartSheet />
          </nav>
        </div>

        <!-- Mobile search bar (expandable) -->
        {#if mobileSearchOpen}
          <div class="pb-3 sm:hidden">
            <SearchBar />
          </div>
        {/if}
      </div>
    </header>
  {/if}

  <!-- Main Content -->
  <main class="flex-1">
    {@render children()}
  </main>

  <!-- Footer -->
  <footer class="mt-auto border-t border-gray-300">
    <div class="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div class="flex flex-col items-center gap-3 sm:flex-row sm:justify-between">
        <p class="text-sm text-gray-500">Hoikka - DX-first e-commerce platform</p>
        <div class="flex items-center gap-2">
          <a href="/privacy-policy" class="text-sm text-gray-500 hover:text-gray-900"
            >Privacy Policy</a
          >
          <Dot class="h-4 w-4 text-gray-500" />
          <a href="/admin" class="text-sm text-gray-500 hover:text-gray-900">Admin</a>
        </div>
      </div>
    </div>
  </footer>
</div>
