<script lang="ts">
  import type { PageData } from "./$types";
  import { Button } from "$lib/components/storefront/ui/button";
  import ProductCard from "$lib/components/storefront/ProductCard.svelte";
  import { goto } from "$app/navigation";
  import { authClient } from "$lib/auth-client";
  import ArrowRightIcon from "@lucide/svelte/icons/arrow-right";

  let { data }: { data: PageData } = $props();
  let demoError = $state<string | null>(null);
  let demoLoading = $state(false);
  // Prefilled with the public demo credentials; editable so a real admin can sign in too
  let loginEmail = $state("admin@example.com");
  let loginPassword = $state("admin538");

  async function handleAdminLogin(event: SubmitEvent) {
    event.preventDefault();
    demoError = null;
    demoLoading = true;
    try {
      const result = await authClient.signIn.email({
        email: loginEmail,
        password: loginPassword
      });
      if (result.error) {
        demoError = result.error.message ?? "Login failed";
        demoLoading = false;
      } else {
        goto("/admin");
      }
    } catch (e) {
      demoError = e instanceof Error ? e.message : "Login failed";
      demoLoading = false;
    }
  }
</script>

<svelte:head>
  <title>SvelteKit Ecommerce Starter - Hoikka</title>
  <meta
    name="description"
    content="Fullstack SvelteKit ecommerce platform. Serverless-ready, monolithic architecture with admin panel and storefront. Deploy on Vercel."
  />
  <meta property="og:title" content="SvelteKit Ecommerce Starter - Hoikka" />
  <meta
    property="og:description"
    content="Fullstack SvelteKit ecommerce platform. Serverless-ready, monolithic architecture with admin panel and storefront. Deploy on Vercel."
  />
  <meta property="og:type" content="website" />
  <meta property="og:url" content="https://hoikka.dev" />
  <meta property="og:image" content="https://hoikka.dev/hoikka-screenshot.jpg" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="SvelteKit Ecommerce Starter - Hoikka" />
  <meta
    name="twitter:description"
    content="Fullstack SvelteKit ecommerce platform. Serverless-ready, monolithic architecture with admin panel and storefront. Deploy on Vercel."
  />
  <meta name="twitter:image" content="https://hoikka.dev/hoikka-screenshot.jpg" />
</svelte:head>

<div>
  <!-- Hero Section -->
  <section class="relative bg-gray-100 pt-10 pb-12 sm:pb-18">
    <a
      href="https://github.com/mhernesniemi/hoikka"
      target="_blank"
      rel="noopener noreferrer"
      class="absolute top-3 right-4 flex h-7 w-7 items-center justify-center rounded-full border border-black text-black transition-colors hover:bg-black hover:text-white sm:right-6"
      aria-label="GitHub repository"
      title="View on GitHub"
    >
      <!-- Inline GitHub mark — lucide 1.x removed brand icons -->
      <svg class="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path
          d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.55v-1.94c-3.2.7-3.87-1.54-3.87-1.54-.52-1.33-1.28-1.68-1.28-1.68-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.03 1.75 2.69 1.25 3.34.95.1-.74.4-1.25.72-1.53-2.55-.29-5.23-1.28-5.23-5.68 0-1.26.45-2.28 1.18-3.09-.12-.29-.51-1.46.11-3.05 0 0 .96-.31 3.16 1.18a11 11 0 0 1 5.76 0c2.2-1.49 3.16-1.18 3.16-1.18.62 1.59.23 2.76.11 3.05.74.81 1.18 1.83 1.18 3.09 0 4.41-2.69 5.38-5.25 5.67.41.35.77 1.05.77 2.12v3.15c0 .3.21.67.8.55A11.51 11.51 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z"
        />
      </svg>
    </a>
    <div class="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
      <div class="flex flex-col items-center gap-8 md:flex-row md:gap-16">
        <div class="flex-1">
          <a href="/" class="mb-6 inline-block bg-[#f7d0dd] text-xl font-bold text-gray-900"
            >"Hoikka"</a
          >
          <h1 class="mb-4 text-3xl font-bold sm:text-4xl md:text-5xl">Opinionated Commerce</h1>
          <p class="mb-10 text-base leading-[1.75] text-gray-600 sm:text-lg">
            Lightweight but powerful e-commerce platform, designed for developers.<br
              class="hidden sm:inline"
            />
            Everything lives in code and it’s yours.
            <span class="text-gray-900 italic">Built with SvelteKit.</span>
          </p>
          <div class="flex items-start gap-4">
            <img
              src="/kuvitus2.png"
              alt="Svelte"
              width="258"
              height="198"
              class="h-16 w-auto sm:h-20"
            />
            <div class="pt-2">
              <a
                href="https://hoikka-docs.vercel.app"
                class="inline-block rounded-lg border bg-white px-6 py-2.5 text-sm font-semibold text-gray-900 transition-colors hover:bg-[#f7d0dd]/50 sm:px-8 sm:py-3 sm:text-base"
              >
                Get Started: Docs
              </a>
              <p class="pt-4 text-xs text-gray-600">
                or
                <code
                  class="ml-1 inline-flex items-center rounded-md border border-black px-1.5 py-0.5 font-mono text-xs font-medium text-black"
                  >pnpx create-hoikka-app</code
                >
              </p>
            </div>
          </div>
        </div>
        <div class="hidden w-full max-w-[220px] md:block md:max-w-[300px]">
          <img
            src="/kuvitus.png"
            alt="Opinionated Commerce"
            width="406"
            height="318"
            class="floating h-full w-full object-cover"
          />
        </div>
      </div>
    </div>
  </section>

  <!-- Demo Section: Products + Admin Login -->
  <section class="py-16">
    <div class="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
      <div class="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <!-- Demo Store Products -->
        <div>
          <div class="mb-8 flex items-baseline justify-between">
            <h2 class="text-xl font-bold">Demo Store Products</h2>
            <a
              href="/products"
              class="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline"
              >View all <ArrowRightIcon class="h-4 w-4" /></a
            >
          </div>

          {#if data.featuredProducts.length === 0}
            <div class="py-12 text-center text-gray-500">
              <p>No products yet.</p>
              <a href="/admin/products" class="text-blue-600 hover:underline">
                Add your first product
              </a>
            </div>
          {:else}
            <div class="grid grid-cols-2 gap-4 sm:gap-6" data-sveltekit-preload-data="viewport">
              {#each data.featuredProducts as product}
                <ProductCard
                  {product}
                  activeDiscounts={data.activeDiscounts}
                  grayscale
                  loading="eager"
                />
              {/each}
            </div>
          {/if}
        </div>

        <!-- Demo Admin UI Login -->
        <div class="flex flex-col">
          <h2 class="mb-8 text-xl font-bold">Admin UI Demo</h2>

          <div class="flex flex-1 flex-col rounded-lg border border-gray-300 bg-white p-6">
            {#if data.hasAdmin}
              <p class="mb-6 text-sm text-gray-600">
                Log in to explore the admin dashboard. The credentials have been filled in for you.
              </p>

              {#if demoError}
                <div class="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-600">
                  {demoError}
                </div>
              {/if}

              <form class="space-y-4" onsubmit={handleAdminLogin}>
                <div>
                  <label for="email" class="mb-1 block text-sm font-medium text-gray-700">
                    Email
                  </label>
                  <input
                    type="email"
                    id="email"
                    autocomplete="username"
                    bind:value={loginEmail}
                    class="w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-gray-900"
                  />
                </div>

                <div>
                  <label for="password" class="mb-1 block text-sm font-medium text-gray-700">
                    Password
                  </label>
                  <input
                    type="password"
                    id="password"
                    autocomplete="current-password"
                    bind:value={loginPassword}
                    class="w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-gray-900"
                  />
                </div>

                <Button type="submit" class="mt-4 w-full" disabled={demoLoading}>
                  {demoLoading ? "Logging in..." : "Log in"}
                </Button>
              </form>
            {:else}
              <p class="mb-6 text-sm text-gray-600">
                No admin account has been created yet. Set up your first admin user to get started.
              </p>

              <Button class="w-full" onclick={() => goto("/admin/setup")}>
                Set Up Admin Account
              </Button>
            {/if}
          </div>
        </div>
      </div>
    </div>
  </section>
</div>

<style>
  @keyframes float {
    0%,
    100% {
      transform: translateY(0px);
    }
    50% {
      transform: translateY(-20px);
    }
  }

  .floating {
    animation: float 9s ease-in-out infinite;
  }
</style>
