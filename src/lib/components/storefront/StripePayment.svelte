<script lang="ts">
  import { onMount } from "svelte";
  import { loadStripe, type Stripe, type StripeElements } from "@stripe/stripe-js";
  import { env } from "$env/dynamic/public";

  let {
    clientSecret,
    onready
  }: {
    clientSecret: string;
    onready: (stripe: Stripe, elements: StripeElements) => void;
  } = $props();

  let paymentElementContainer: HTMLDivElement;
  let loading = $state(true);
  let error = $state<string | null>(null);

  onMount(async () => {
    try {
      const stripe = await loadStripe(env.PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "");
      if (!stripe) {
        error = "Failed to load Stripe";
        loading = false;
        return;
      }

      const elements = stripe.elements({ clientSecret });
      const paymentElement = elements.create("payment");
      paymentElement.mount(paymentElementContainer);

      paymentElement.on("ready", () => {
        loading = false;
      });

      onready(stripe, elements);
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to initialize payment";
      loading = false;
    }
  });
</script>

<div class="space-y-3">
  {#if error}
    <p class="text-sm text-red-600">{error}</p>
  {/if}

  {#if loading}
    <div class="flex items-center justify-center py-8">
      <div
        class="h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-blue-600"
      ></div>
      <span class="ml-2 text-sm text-gray-500">Loading payment form...</span>
    </div>
  {/if}

  <div bind:this={paymentElementContainer}></div>
</div>
