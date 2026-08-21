<script lang="ts">
  import { STORE_NAME } from "@hoikka/core/config/derived";
  import type { PageData } from "./$types.js";
  import Check from "@lucide/svelte/icons/check";
  import Download from "@lucide/svelte/icons/download";
  import { formatPrice } from "@hoikka/core/shared/utils";
  import { getCart } from "$lib/remote/cart.remote";
  import { browser } from "$app/environment";

  let { data }: { data: PageData } = $props();

  // The cart cookie was cleared on completion — refresh the client's cart query
  if (browser) {
    getCart().refresh();
  }
</script>

<svelte:head>
  <title>Order Confirmed | {STORE_NAME}</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<div class="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
  <div class="mb-8 text-center">
    <div class="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
      <Check class="h-8 w-8 text-green-600" />
    </div>
    <h1 class="mb-2 text-3xl font-bold">Thank You for Your Order!</h1>
    <p class="text-gray-600">
      Your order <span class="font-semibold text-gray-900">{data.receipt.code}</span> has been placed
      successfully.
    </p>
  </div>

  {#if data.receipt.needsAttention}
    <div class="mb-8 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
      <p class="font-medium">One item needs a moment</p>
      <p class="mt-1">
        Your payment went through, but we couldn't hand over everything automatically. Our team has
        been notified and will be in touch — no action is needed from you.
      </p>
    </div>
  {/if}

  {#if data.downloads.length > 0}
    <div class="mb-8 rounded-lg border border-gray-200 p-4 sm:p-6">
      <h2 class="mb-4 text-xl font-semibold">Your Downloads</h2>
      <ul class="space-y-3">
        {#each data.downloads as download}
          <li class="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p class="font-medium">{download.productName}</p>
              <p class="text-sm text-gray-500">{download.fileName}</p>
            </div>
            <a
              href="/downloads/{download.token}"
              class="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm text-white transition-colors hover:bg-blue-700"
            >
              <Download class="h-4 w-4" />
              Download
            </a>
          </li>
        {/each}
      </ul>
      <p class="mt-4 text-sm text-gray-500">
        We've also emailed these links. They expire after 30 days.
      </p>
    </div>
  {/if}

  <div>
    <h2 class="mb-6 text-xl font-semibold">Order Summary</h2>

    <div class="mb-6 space-y-4">
      {#each data.receipt.lines as line}
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
        <span class="font-medium">{formatPrice(data.receipt.subtotal)}</span>
      </div>

      {#if data.receipt.discount > 0}
        <div class="flex justify-between text-sm">
          <span class="text-gray-600">Discount</span>
          <span class="font-medium text-green-600">
            -{formatPrice(data.receipt.discount)}
          </span>
        </div>
      {/if}

      <div class="flex justify-between text-sm">
        <span class="text-gray-600">Shipping</span>
        <span class="font-medium">{formatPrice(data.receipt.shipping)}</span>
      </div>

      <div class="flex justify-between border-t pt-2 text-lg font-bold">
        <span>Total</span>
        <span>{formatPrice(data.receipt.total)}</span>
      </div>
    </div>
  </div>

  <div class="mt-12 space-y-4 text-center">
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
      {#if data.receipt.isRegisteredCustomer}
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
