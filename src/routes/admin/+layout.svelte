<script lang="ts">
  import "./admin.css";
  import { onMount } from "svelte";
  import { page } from "$app/stores";
  import { beforeNavigate } from "$app/navigation";
  import { goto } from "$app/navigation";
  import { authClient } from "$lib/auth-client";
  import { Toaster } from "$lib/components/admin/ui/sonner";
  import * as DropdownMenu from "$lib/components/admin/ui/dropdown-menu";
  import {
    initTheme,
    isDark,
    setTheme,
    getTheme,
    type Theme
  } from "$lib/stores/admin-theme.svelte";
  import { cn } from "$lib/utils";
  import type { LayoutData } from "./$types";
  import LayoutGrid from "@lucide/svelte/icons/layout-grid";
  import Filter from "@lucide/svelte/icons/filter";
  import FolderOpen from "@lucide/svelte/icons/folder-open";
  import ShoppingCart from "@lucide/svelte/icons/shopping-cart";
  import Users from "@lucide/svelte/icons/users";
  import Star from "@lucide/svelte/icons/star";
  import Tag from "@lucide/svelte/icons/tag";
  import FileText from "@lucide/svelte/icons/file-text";
  import { Percent as PercentIcon } from "@lucide/svelte";
  import ExternalLink from "@lucide/svelte/icons/external-link";
  import ChevronsUpDown from "@lucide/svelte/icons/chevrons-up-down";
  import LogOut from "@lucide/svelte/icons/log-out";
  import Sun from "@lucide/svelte/icons/sun";
  import Moon from "@lucide/svelte/icons/moon";
  import Monitor from "@lucide/svelte/icons/monitor";
  import Check from "@lucide/svelte/icons/check";
  import Menu from "@lucide/svelte/icons/menu";

  let { children, data }: { children: any; data: LayoutData } = $props();

  let sidebarOpen = $state(false);
  let mounted = $state(false);

  beforeNavigate(() => {
    sidebarOpen = false;
  });

  onMount(() => {
    const cleanup = initTheme();
    mounted = true;
    return () => {
      cleanup();
      document.documentElement.style.backgroundColor = "";
    };
  });

  const dark = $derived(mounted ? isDark() : data.adminDark);

  // Set <html> background so macOS overscroll bounce matches the admin theme.
  // Without this the body's default bg-gray-50 shows through as a white flash.
  $effect(() => {
    document.documentElement.style.backgroundColor = dark ? "oklch(0.175 0.014 265)" : "";
  });

  interface NavItem {
    href: string;
    label: string;
    icon: string;
  }

  const navItems: NavItem[] = [
    { href: "/admin/orders", label: "Orders", icon: "shopping-cart" },
    { href: "/admin/products", label: "Products", icon: "tag" },
    { href: "/admin/collections", label: "Collections", icon: "folder" },
    { href: "/admin/facets", label: "Facets", icon: "filter" },
    { href: "/admin/categories", label: "Categories", icon: "category" },
    { href: "/admin/customers", label: "Customers", icon: "users" },
    { href: "/admin/reviews", label: "Reviews", icon: "star" },
    { href: "/admin/promotions", label: "Promotions", icon: "percent" },
    { href: "/admin/content-pages", label: "Pages", icon: "file-text" }
  ];

  function isActive(href: string): boolean {
    return $page.url.pathname.startsWith(href);
  }
</script>

<div class="min-h-screen bg-background font-sans text-foreground antialiased" data-admin class:dark>
  <!-- Sidebar -->
  <aside
    class={cn(
      "fixed inset-y-0 left-0 z-40 w-64 border-r transition-transform duration-200 lg:translate-x-0",
      dark ? "border-gray-800 bg-gray-900 text-white" : "border-gray-200 bg-gray-50 text-gray-900",
      sidebarOpen ? "translate-x-0" : "max-lg:-translate-x-full"
    )}
  >
    <div class="p-6">
      <h1
        class={cn(
          "font-italic font-mono text-xl font-bold",
          dark ? "text-blue-400" : "text-blue-600"
        )}
      >
        Hoikka
      </h1>
      <p class={cn("text-sm", dark ? "text-gray-400" : "text-gray-500")}>Store Dashboard</p>
    </div>

    <nav class="mt-6">
      {#each navItems as item}
        <a
          href={item.href}
          class={cn(
            "flex items-center gap-3 px-6 py-3",
            dark
              ? "text-gray-300 hover:bg-gray-800/60 hover:text-white"
              : "text-gray-600 hover:bg-gray-200/60 hover:text-gray-900",
            isActive(item.href) &&
              (dark
                ? "border-l-4 border-blue-500 bg-gray-800/60 text-white"
                : "border-l-4 border-blue-500 bg-gray-200/60 text-gray-900")
          )}
        >
          <span class="h-5 w-5 opacity-60">
            {#if item.icon === "shopping-cart"}
              <ShoppingCart class="h-5 w-5" strokeWidth={1.6} />
            {:else if item.icon === "users"}
              <Users class="h-5 w-5" strokeWidth={1.6} />
            {:else if item.icon === "category"}
              <LayoutGrid class="h-5 w-5" strokeWidth={1.6} />
            {:else if item.icon === "filter"}
              <Filter class="h-5 w-5" strokeWidth={1.6} />
            {:else if item.icon === "tag"}
              <Tag class="h-5 w-5" strokeWidth={1.6} />
            {:else if item.icon === "folder"}
              <FolderOpen class="h-5 w-5" strokeWidth={1.6} />
            {:else if item.icon === "star"}
              <Star class="h-5 w-5" strokeWidth={1.6} />
            {:else if item.icon === "percent"}
              <PercentIcon class="h-5 w-5" strokeWidth={1.6} />
            {:else if item.icon === "file-text"}
              <FileText class="h-5 w-5" strokeWidth={1.6} />
            {/if}
          </span>
          {item.label}
        </a>
      {/each}
    </nav>

    <div class={cn("absolute right-0 bottom-0 left-0", dark ? "bg-gray-900" : "bg-gray-50")}>
      <div class={cn("border-t", dark ? "border-gray-800" : "border-gray-200")}>
        <a
          href="/"
          target="_blank"
          rel="noopener noreferrer"
          class={cn(
            "group flex items-center gap-2 p-4 text-sm",
            dark ? "hover:bg-gray-800/60" : "hover:bg-gray-200/60"
          )}
        >
          <ExternalLink
            class={cn("h-4 w-4", dark ? "text-gray-300" : "text-gray-500")}
            strokeWidth={1.6}
          />
          <span
            class={cn(
              dark
                ? "text-gray-300 group-hover:text-white"
                : "text-gray-600 group-hover:text-gray-900"
            )}>Storefront</span
          >
        </a>
      </div>
      <div class={cn("mb-1 border-t", dark ? "border-gray-800" : "border-gray-200")}>
        <DropdownMenu.Root>
          <DropdownMenu.Trigger
            class={cn(
              "flex w-full items-center justify-between p-4",
              dark
                ? "text-gray-300 hover:bg-gray-800/60 hover:text-white"
                : "text-gray-600 hover:bg-gray-200/60 hover:text-gray-900"
            )}
          >
            <span class="truncate text-sm"
              >{data.adminUser?.email ?? data.adminUser?.name ?? "Admin"}</span
            >
            <ChevronsUpDown class="h-5 w-5 shrink-0 text-gray-400" strokeWidth={1.6} />
          </DropdownMenu.Trigger>
          <DropdownMenu.Content side="right" align="end" class="w-48">
            <DropdownMenu.Sub>
              <DropdownMenu.SubTrigger>
                <Sun class="h-4 w-4" strokeWidth={1.6} />
                Theme
              </DropdownMenu.SubTrigger>
              <DropdownMenu.SubContent>
                <DropdownMenu.Item onclick={() => setTheme("light")}>
                  <Sun class="h-4 w-4" strokeWidth={1.6} />
                  Light
                  {#if getTheme() === "light"}
                    <Check class="ml-auto h-4 w-4" />
                  {/if}
                </DropdownMenu.Item>
                <DropdownMenu.Item onclick={() => setTheme("dark")}>
                  <Moon class="h-4 w-4" strokeWidth={1.6} />
                  Dark
                  {#if getTheme() === "dark"}
                    <Check class="ml-auto h-4 w-4" />
                  {/if}
                </DropdownMenu.Item>
                <DropdownMenu.Item onclick={() => setTheme("system")}>
                  <Monitor class="h-4 w-4" strokeWidth={1.6} />
                  System
                  {#if getTheme() === "system"}
                    <Check class="ml-auto h-4 w-4" />
                  {/if}
                </DropdownMenu.Item>
              </DropdownMenu.SubContent>
            </DropdownMenu.Sub>
            <DropdownMenu.Separator />
            <DropdownMenu.Item
              onclick={async () => {
                await authClient.signOut();
                goto("/admin/login");
              }}
            >
              <LogOut class="h-4 w-4" strokeWidth={1.6} />
              Log out
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Root>
      </div>
    </div>
  </aside>

  <!-- Mobile backdrop -->
  {#if sidebarOpen}
    <button
      class="fixed inset-0 z-30 bg-black/50 lg:hidden"
      onclick={() => (sidebarOpen = false)}
      aria-label="Close sidebar"
    ></button>
  {/if}

  <!-- Main content -->
  <main class="px-4 pt-4 pb-6 lg:ml-64 lg:pt-6 lg:pr-8 lg:pb-8 lg:pl-8">
    <!-- Mobile hamburger -->
    <button
      class="mb-4 rounded-lg p-2 hover:bg-hover lg:hidden"
      onclick={() => (sidebarOpen = true)}
      aria-label="Open sidebar"
    >
      <Menu class="h-6 w-6" />
    </button>
    {@render children()}
  </main>

  <Toaster />
</div>

<svelte:window
  onkeydown={(e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "s") {
      const form = document.querySelector<HTMLFormElement>("main form[id][method='POST']");
      if (form) {
        e.preventDefault();
        form.requestSubmit();
      }
    }
  }}
/>
