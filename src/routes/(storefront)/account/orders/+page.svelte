<script lang="ts">
  import { cn, orderStateLabel } from "$lib/utils";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();

  function formatDate(date: Date | string): string {
    return new Date(date).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric"
    });
  }

  function formatPrice(cents: number): string {
    return (cents / 100).toFixed(2);
  }

  function getStateColor(state: string): string {
    switch (state) {
      case "delivered":
        return "bg-green-100 text-green-800";
      case "shipped":
        return "bg-blue-100 text-blue-800";
      case "paid":
        return "bg-indigo-100 text-indigo-800";
      case "cancelled":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  }
</script>

<svelte:head>
  <title>My Orders | Hoikka</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<div>
  <h2 class="mb-4 text-lg font-semibold">Order History</h2>

  {#if data.orders.length === 0}
    <div class="p-6 text-center text-gray-500">
      <p>You haven't placed any orders yet.</p>
      <a href="/products" class="mt-2 inline-block text-blue-600 hover:underline">
        Start shopping
      </a>
    </div>
  {:else}
    <div class="divide-y">
      {#each data.orders as order}
        <div class="rounded-lg border border-gray-200 p-6">
          <div class="mb-4 flex items-center justify-between">
            <div>
              <p class="font-medium">Order #{order.code}</p>
              <p class="text-sm text-gray-500">{formatDate(order.createdAt)}</p>
            </div>
            <span
              class={cn("rounded-full px-3 py-1 text-sm font-medium", getStateColor(order.state))}
            >
              {orderStateLabel(order.state)}
            </span>
          </div>

          <div class="flex items-center justify-between">
            <p class="text-gray-600">
              Total: <span class="font-medium text-gray-900">{formatPrice(order.total)}</span>
            </p>
            <a href="/account/orders/{order.id}" class="text-sm text-blue-600 hover:underline">
              View details
            </a>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>
