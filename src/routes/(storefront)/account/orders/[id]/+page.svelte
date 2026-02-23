<script lang="ts">
  import { cn, orderStateLabel } from "$lib/utils";
  import { imageUrl } from "$lib/image";
  import type { PageData } from "./$types";
  import ArrowLeft from "@lucide/svelte/icons/arrow-left";
  import Package from "@lucide/svelte/icons/package";

  let { data }: { data: PageData } = $props();

  function formatDate(date: Date | string): string {
    return new Date(date).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
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
  <title>Order #{data.order.code} | Hoikka</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<div>
  <!-- Header -->
  <div class="border-b p-6">
    <a
      href="/account/orders"
      class="mb-4 inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900"
    >
      <ArrowLeft class="h-4 w-4" />
      Back to orders
    </a>

    <div class="flex items-center justify-between">
      <div>
        <h2 class="text-lg font-semibold">Order #{data.order.code}</h2>
        <p class="text-sm text-gray-500">{formatDate(data.order.createdAt)}</p>
      </div>
      <span
        class={cn("rounded-full px-3 py-1 text-sm font-medium", getStateColor(data.order.state))}
      >
        {orderStateLabel(data.order.state)}
      </span>
    </div>
  </div>

  <!-- Order Items -->
  <div class="border-b p-6">
    <h3 class="mb-4 font-medium">Items</h3>
    <div class="space-y-4">
      {#each data.order.lines as line}
        <div class="flex items-start gap-4">
          {#if line.imageUrl}
            <img
              src={imageUrl(line.imageUrl, 100)}
              alt={line.productName}
              class="h-16 w-16 rounded-lg object-cover"
            />
          {:else}
            <div class="flex h-16 w-16 items-center justify-center rounded-lg bg-gray-100">
              <Package class="h-6 w-6 text-gray-400" />
            </div>
          {/if}
          <div class="flex-1">
            <p class="font-medium">{line.productName}</p>
            {#if line.variantName}
              <p class="text-sm text-gray-500">{line.variantName}</p>
            {/if}
            <p class="text-sm text-gray-500">Qty: {line.quantity}</p>
          </div>
          <p class="font-medium">{formatPrice(line.lineTotal)} {data.order.currencyCode}</p>
        </div>
      {/each}
    </div>
  </div>

  <!-- Order Summary -->
  <div class="border-b p-6">
    <h3 class="mb-4 font-medium">Summary</h3>
    <div class="space-y-2">
      <div class="flex justify-between text-sm">
        <span class="text-gray-600">Subtotal</span>
        <span>{formatPrice(data.order.subtotal)} {data.order.currencyCode}</span>
      </div>
      {#if data.order.shipping > 0}
        <div class="flex justify-between text-sm">
          <span class="text-gray-600">Shipping</span>
          <span>{formatPrice(data.order.shipping)} {data.order.currencyCode}</span>
        </div>
      {/if}
      {#if data.order.discount > 0}
        <div class="flex justify-between text-sm">
          <span class="text-gray-600">Discount</span>
          <span class="text-green-600"
            >-{formatPrice(data.order.discount)} {data.order.currencyCode}</span
          >
        </div>
      {/if}
      {#if data.order.taxTotal > 0}
        <div class="flex justify-between text-sm">
          <span class="text-gray-600">Tax</span>
          <span>{formatPrice(data.order.taxTotal)} {data.order.currencyCode}</span>
        </div>
      {/if}
      <div class="flex justify-between border-t pt-2 font-medium">
        <span>Total</span>
        <span>{formatPrice(data.order.total)} {data.order.currencyCode}</span>
      </div>
    </div>
  </div>

  <!-- Shipping Address -->
  {#if data.order.shippingFullName}
    <div class="p-6">
      <h3 class="mb-4 font-medium">Shipping Address</h3>
      <div class="text-sm text-gray-600">
        <p class="font-medium text-gray-900">{data.order.shippingFullName}</p>
        <p>{data.order.shippingStreetLine1}</p>
        {#if data.order.shippingStreetLine2}
          <p>{data.order.shippingStreetLine2}</p>
        {/if}
        <p>{data.order.shippingPostalCode} {data.order.shippingCity}</p>
        <p>{data.order.shippingCountry}</p>
      </div>
    </div>
  {/if}
</div>
