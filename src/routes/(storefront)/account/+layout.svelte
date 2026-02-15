<script lang="ts">
  import { page } from "$app/stores";
  import { cn } from "$lib/utils";
  import { SignOutButton } from "svelte-clerk";
  import { buttonVariants } from "$lib/components/storefront/ui/button";

  let { children } = $props();

  const navItems = [
    { href: "/account", label: "Profile" },
    { href: "/account/orders", label: "Order History" },
    { href: "/account/addresses", label: "Addresses" }
  ];

  function isActive(href: string): boolean {
    const path = $page.url.pathname;
    if (href === "/account") {
      return path === "/account";
    }
    return path.startsWith(href);
  }
</script>

<div class="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
  <div class="mb-8 flex items-start justify-between">
    <div>
      <h1 class="text-2xl font-bold">My Account</h1>
      <p class="mt-1 text-gray-600">Manage your account settings and view your orders</p>
    </div>
    <SignOutButton class={buttonVariants({ variant: "outline" })}>Sign out</SignOutButton>
  </div>

  <div class="grid grid-cols-1 gap-8 md:grid-cols-4">
    <!-- Sidebar -->
    <aside class="md:col-span-1">
      <nav class="space-y-2">
        {#each navItems as item}
          <a
            href={item.href}
            class={cn(
              "block rounded-lg px-4 py-2",
              isActive(item.href)
                ? "bg-blue-50 font-medium text-blue-600"
                : "text-gray-600 hover:bg-gray-50"
            )}
          >
            {item.label}
          </a>
        {/each}
      </nav>
    </aside>

    <!-- Main Content -->
    <main class="md:col-span-3">
      {@render children()}
    </main>
  </div>
</div>
