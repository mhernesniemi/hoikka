<script lang="ts">
  import type { PageData } from "./$types";
  import { cn } from "$lib/utils";
  import { Button } from "$lib/components/storefront/ui/button";
  import ProductCard from "$lib/components/storefront/ProductCard.svelte";
  import { goto } from "$app/navigation";
  import { authClient } from "$lib/auth-client";
  import ArrowRightIcon from "@lucide/svelte/icons/arrow-right";
  import CopyIcon from "@lucide/svelte/icons/copy";
  import CheckIcon from "@lucide/svelte/icons/check";

  let { data }: { data: PageData } = $props();
  let demoError = $state<string | null>(null);
  const commandText = "bunx create-hoikka-app";
  let copied = $state(false);

  const copyCommand = () => {
    navigator.clipboard?.writeText(commandText);
    copied = true;
    setTimeout(() => (copied = false), 100);
  };
</script>

<svelte:head>
  <title>Hoikka - DX-first ecommerce platform</title>
  <meta
    name="description"
    content="Lightweight but powerful DX-first ecommerce platform built with SvelteKit. 100% customizable and owned by you."
  />
</svelte:head>

<div>
  <!-- Hero Section -->
  <section class="bg-gray-100 pt-10 pb-18">
    <div class="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
      <div class="flex items-center gap-16">
        <div>
          <a href="/" class="mb-6 inline-block bg-[#f7d0dd] text-xl font-bold text-gray-900"
            >"Hoikka"</a
          >
          <h1 class="mb-4 text-4xl font-bold md:text-5xl">Opinionated Commerce</h1>
          <p class="mb-10 text-lg leading-[1.75] text-gray-600">
            Lightweight but powerful e-commerce platform, designed for developers.<br />
            Everything lives in code and it’s yours.
            <span class="text-gray-900 italic">Built with SvelteKit.</span>
          </p>
          <div class="flex items-start gap-4">
            <img src="/kuvitus2.png" alt="Svelte" class="h-20 w-auto" />
            <div class="pt-2">
              <a
                href="https://hoikka-docs.vercel.app"
                class="h inline-block rounded-lg border bg-white px-8 py-3 font-semibold text-gray-900 transition-colors hover:bg-[#f7d0dd]/50"
              >
                Get Started: Docs
              </a>
              <p class="pt-4 text-xs text-gray-600">
                or
                <span
                  class={cn(
                    "ml-1 inline-flex items-center overflow-hidden rounded-md border border-pink-200 transition-colors duration-300",
                    copied ? "bg-pink-200" : "bg-white"
                  )}
                >
                  <code
                    class="inline-flex items-center px-1.5 py-0.5 font-mono font-medium text-pink-700"
                    >{commandText}</code
                  >
                  <button
                    type="button"
                    class="group inline-flex items-center justify-center border-l border-pink-200 px-1.5 py-0.5 text-pink-600"
                    title="Copy command"
                    aria-label="Copy command"
                    onclick={copyCommand}
                  >
                    <CopyIcon class="h-3.5 w-3.5 group-hover:text-pink-700" />
                  </button>
                </span>
              </p>
            </div>
          </div>
        </div>
        <div class="max-w-[300px]">
          <img
            src="/kuvitus.png"
            alt="Opinionated Commerce"
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
            <div class="grid grid-cols-1 gap-6 sm:grid-cols-2">
              {#each data.featuredProducts as product}
                <ProductCard {product} activeDiscounts={data.activeDiscounts} />
              {/each}
            </div>
          {/if}
        </div>

        <!-- Demo Admin UI Login -->
        <div class="ml-12 flex flex-col">
          <h2 class="mb-8 text-xl font-bold">Admin UI Demo</h2>

          <div class="flex flex-1 flex-col rounded-lg border border-gray-300 bg-white p-6">
            <p class="mb-6 text-sm text-gray-600">
              Log in to explore the admin dashboard. The credentials have been filled in for you.
            </p>

            {#if demoError}
              <div class="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-600">
                {demoError}
              </div>
            {/if}

            <div class="space-y-4">
              <div>
                <label for="email" class="mb-1 block text-sm font-medium text-gray-700">
                  Email
                </label>
                <input
                  type="email"
                  id="email"
                  readonly
                  value="admin@example.com"
                  class="w-full cursor-not-allowed rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-gray-500"
                />
              </div>

              <div>
                <label for="password" class="mb-1 block text-sm font-medium text-gray-700">
                  Password
                </label>
                <input
                  type="password"
                  id="password"
                  readonly
                  value="admin538"
                  class="w-full cursor-not-allowed rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-gray-500"
                />
              </div>

              <Button
                class="mt-4 w-full"
                onclick={async () => {
                  demoError = null;
                  try {
                    const result = await authClient.signIn.email({
                      email: "admin@example.com",
                      password: "admin538"
                    });
                    if (result.error) {
                      demoError = result.error.message ?? "Login failed";
                    } else {
                      goto("/admin");
                    }
                  } catch (e) {
                    demoError = e instanceof Error ? e.message : "Login failed";
                  }
                }}
              >
                Log in
              </Button>
            </div>
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
