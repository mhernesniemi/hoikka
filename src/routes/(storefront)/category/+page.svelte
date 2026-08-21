<script lang="ts">
  import { STORE_NAME } from "$lib/config/store.js";
  import type { PageData } from "./$types";
  import FolderOpen from "@lucide/svelte/icons/folder-open";

  let { data }: { data: PageData } = $props();

  function buildPath(node: (typeof data.tree)[0], parents: string[] = []): string {
    return "/category/" + [...parents, node.slug].join("/");
  }
</script>

<svelte:head>
  <title>Categories | {STORE_NAME}</title>
  <meta
    name="description"
    content="Browse products by category. Find exactly what you're looking for."
  />
  <meta property="og:title" content="Categories | Hoikka" />
  <meta
    property="og:description"
    content="Browse products by category. Find exactly what you're looking for."
  />
  <meta property="og:type" content="website" />
</svelte:head>

<div class="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
  <div class="mb-8">
    <h1 class="text-3xl font-bold text-gray-900">Categories</h1>
    <p class="mt-2 text-gray-600">Browse products by category</p>
  </div>

  {#if data.tree.length === 0}
    <div class="py-16 text-center">
      <FolderOpen class="mx-auto h-12 w-12 text-gray-400" />
      <h3 class="mt-4 text-lg font-medium text-gray-900">No categories yet</h3>
      <p class="mt-2 text-gray-500">
        <a href="/products" class="text-blue-600 hover:text-blue-700">View all products</a>
      </p>
    </div>
  {:else}
    <div class="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {#each data.tree as rootCategory}
        <div class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <a
            href={buildPath(rootCategory)}
            class="text-lg font-semibold text-gray-900 hover:text-blue-600"
          >
            {rootCategory.name}
          </a>

          {#if rootCategory.children.length > 0}
            <ul class="mt-4 space-y-2">
              {#each rootCategory.children as child}
                <li>
                  <a
                    href={buildPath(child, [rootCategory.slug])}
                    class="text-sm text-gray-600 hover:text-blue-600"
                  >
                    {child.name}
                  </a>

                  {#if child.children.length > 0}
                    <ul class="mt-1 ml-4 space-y-1">
                      {#each child.children.slice(0, 3) as grandchild}
                        <li>
                          <a
                            href={buildPath(grandchild, [rootCategory.slug, child.slug])}
                            class="text-xs text-gray-500 hover:text-blue-600"
                          >
                            {grandchild.name}
                          </a>
                        </li>
                      {/each}
                      {#if child.children.length > 3}
                        <li class="text-xs text-gray-400">
                          +{child.children.length - 3} more
                        </li>
                      {/if}
                    </ul>
                  {/if}
                </li>
              {/each}
            </ul>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</div>
