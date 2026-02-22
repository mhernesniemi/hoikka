<script lang="ts">
  import type { PageData } from "./$types.js";
  import Check from "@lucide/svelte/icons/check";
  import { formatPrice } from "$lib/utils.js";

  let { data }: { data: PageData } = $props();
</script>

<svelte:head>
  <title>Order Confirmed | Hoikka</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<div class="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
  <div class="mb-8 text-center">
    <div class="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
      <Check class="h-8 w-8 text-green-600" />
    </div>
    <h1 class="mb-2 text-3xl font-bold">Thank You for Your Order!</h1>
    <p class="text-gray-600">
      Your order <span class="font-semibold text-gray-900">{data.order.code}</span> has been placed successfully.
    </p>
  </div>

  <div class="mb-6 rounded-lg bg-white p-8 shadow-lg">
    <h2 class="mb-6 text-xl font-semibold">Order Summary</h2>

    <div class="mb-6 space-y-4">
      {#each data.order.lines as line}
        <div class="flex items-start justify-between border-b border-gray-200 pb-4 last:border-0">
          <div>
            <p class="font-medium">{line.productName}</p>
            {#if line.variantName}
              <p class="text-sm text-gray-500">{line.variantName}</p>
            {/if}
            <p class="text-sm text-gray-500">Quantity: {line.quantity}</p>
          </div>
          <p class="font-medium">{formatPrice(line.lineTotal)}</p>
        </div>
      {/each}
    </div>

    <div class="space-y-2 border-t pt-4">
      <div class="flex justify-between text-sm">
        <span class="text-gray-600">Subtotal</span>
        <span class="font-medium">{formatPrice(data.order.subtotal)}</span>
      </div>

      {#if data.order.discount > 0}
        <div class="flex justify-between text-sm">
          <span class="text-gray-600">Discount</span>
          <span class="font-medium text-green-600">
            -{formatPrice(data.order.discount)}
          </span>
        </div>
      {/if}

      <div class="flex justify-between text-sm">
        <span class="text-gray-600">Shipping</span>
        <span class="font-medium">{formatPrice(data.order.shipping)}</span>
      </div>

      <div class="flex justify-between border-t pt-2 text-lg font-bold">
        <span>Total</span>
        <span>{formatPrice(data.order.total)}</span>
      </div>
    </div>
  </div>

  {#if data.order.shippingFullName}
    <div class="mb-6 rounded-lg bg-white p-6 shadow">
      <h2 class="mb-4 text-lg font-semibold">Shipping Address</h2>
      <address class="text-gray-600 not-italic">
        <p class="font-medium text-gray-900">{data.order.shippingFullName}</p>
        <p>{data.order.shippingStreetLine1}</p>
        {#if data.order.shippingStreetLine2}
          <p>{data.order.shippingStreetLine2}</p>
        {/if}
        <p>
          {data.order.shippingPostalCode}
          {data.order.shippingCity}
        </p>
        <p>{data.order.shippingCountry}</p>
      </address>
    </div>
  {/if}

  <div class="space-y-4 text-center">
    <p class="text-gray-600">
      We've sent a confirmation email with your order details. You'll receive another email when
      your order ships.
    </p>
    <div class="flex justify-center gap-4">
      <a
        href="/products"
        class="rounded-lg border border-gray-300 px-6 py-2 text-gray-700 transition-colors hover:bg-gray-50"
      >
        Continue Shopping
      </a>
      {#if data.order.customerId}
        <a
          href="/account/orders"
          class="rounded-lg bg-blue-600 px-6 py-2 text-white transition-colors hover:bg-blue-700"
        >
          View My Orders
        </a>
      {/if}
    </div>
  </div>
</div>
