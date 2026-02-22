<script lang="ts">
  import { enhance } from "$app/forms";
  import { Button } from "$lib/components/storefront/ui/button";
  import { Input } from "$lib/components/storefront/ui/input";
  import { Label } from "$lib/components/storefront/ui/label";
  import { Alert } from "$lib/components/storefront/ui/alert";
  import StripePayment from "$lib/components/storefront/StripePayment.svelte";
  import { formatPrice, cn } from "$lib/utils.js";
  import { imageUrl } from "$lib/image";
  import ShoppingCart from "@lucide/svelte/icons/shopping-cart";
  import type { Stripe, StripeElements } from "@stripe/stripe-js";
  import type { PageData } from "./$types.js";

  let { data, form }: { data: PageData; form: any } = $props();

  let selectedShippingRate = $state<(typeof data.shippingRates)[0] | null>(null);
  let selectedPaymentMethod = $state<NonNullable<typeof data.paymentMethods>[number] | null>(null);
  let isProcessingPayment = $state(false);
  let isCompletingOrder = $state(false);
  let promoCode = $state("");
  let stripeRef = $state<Stripe | null>(null);
  let elementsRef = $state<StripeElements | null>(null);
  let stripeError = $state<string | null>(null);
  let stripeConfirmed = $state(false);
  let completeOrderForm = $state<HTMLFormElement | null>(null);

  // Combine form and data for reactive state
  const currentOrderShipping = $derived(form?.orderShipping ?? data.orderShipping);
  const currentPaymentMethods = $derived(form?.paymentMethods ?? data.paymentMethods);
  const currentPaymentInfo = $derived(form?.paymentInfo ?? data.paymentInfo);
  const currentCart = $derived(form?.cart ?? data.cart);
  const currentShippingRates = $derived(form?.shippingRates ?? data.shippingRates);
  const isDigitalOnly = $derived(data.isDigitalOnly);
  const contactInfoSet = $derived(
    form?.contactInfoSet || (isDigitalOnly && currentCart?.customerEmail)
  );
  const currentAppliedPromotions = $derived(
    form?.appliedPromotions ?? data.appliedPromotions ?? []
  );
  const hasShippingPromo = $derived(
    currentAppliedPromotions.some((p: any) => p.type === "shipping")
  );

  // Initialize selected shipping rate if already set
  $effect(() => {
    if (currentOrderShipping && currentShippingRates.length > 0 && !selectedShippingRate) {
      const rate = currentShippingRates.find(
        (r: (typeof currentShippingRates)[number]) =>
          r.methodId === currentOrderShipping?.shippingMethodId
      );
      if (rate) {
        selectedShippingRate = rate;
      }
    }
  });

  // Form data for physical products (shipping address)
  let addressFormData = $state({
    fullName: data.customerFullName ?? data.cart?.shippingFullName ?? "",
    streetLine1: data.cart?.shippingStreetLine1 ?? "",
    city: data.cart?.shippingCity ?? "",
    postalCode: data.cart?.shippingPostalCode ?? "",
    country: data.cart?.shippingCountry ?? "FI"
  });

  // Saved addresses
  const savedAddresses = $derived(form?.savedAddresses ?? data.savedAddresses ?? []);
  const cartHasAddress = $derived(!!currentCart?.shippingPostalCode);

  // Show address picker only if: has saved addresses AND no address set on cart AND user hasn't chosen manual entry
  let preferManualEntry = $state(false);
  let isEditingAddress = $state(false);
  let saveAddressForFuture = $state(false);
  let isEditingShipping = $state(false);
  const showAddressPicker = $derived(
    savedAddresses.length > 0 && !cartHasAddress && !preferManualEntry
  );

  // Auto-select default saved address on mount
  let autoSelectForm = $state<HTMLFormElement | null>(null);
  let hasAutoSelected = $state(false);

  $effect(() => {
    if (autoSelectForm && !hasAutoSelected && showAddressPicker && savedAddresses.length > 0) {
      hasAutoSelected = true;
      autoSelectForm.requestSubmit();
    }
  });

  // Form data for digital products (contact info)
  let contactFormData = $state({
    fullName: data.customerFullName ?? data.cart?.shippingFullName ?? "",
    email: data.customerEmail ?? data.cart?.customerEmail ?? ""
  });

  function selectShippingRate(rate: (typeof data.shippingRates)[0]) {
    selectedShippingRate = rate;
  }
</script>

<svelte:head>
  <title>Checkout | Hoikka</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<div class="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
  <h1 class="mb-8 text-3xl font-bold">Checkout</h1>

  {#if !currentCart || currentCart.lines.length === 0}
    <p class="mb-4 text-gray-500">Your cart is empty</p>
    <a href="/products" class="text-blue-600 underline hover:text-blue-700">Browse products</a>
  {:else}
    <div class="grid grid-cols-1 gap-8 lg:grid-cols-5">
      <!-- Main Content -->
      <div class="space-y-10 lg:col-span-3">
        {#if form?.error}
          <Alert variant="destructive">
            <p>{form.error}</p>
            {#if form?.stockErrors?.length}
              <ul class="mt-2 list-inside list-disc text-sm">
                {#each form.stockErrors as stockError}
                  <li>{stockError}</li>
                {/each}
              </ul>
            {/if}
          </Alert>
        {/if}

        {#if isDigitalOnly}
          <!-- Contact Info for Digital Products -->
          <div class="rounded-lg bg-white p-6 shadow">
            <h2 class="mb-4 text-xl font-semibold">Contact Information</h2>
            <p class="mb-4 text-sm text-gray-600">
              Your digital product will be delivered to this email address after payment.
            </p>

            {#if contactInfoSet}
              <Alert variant="success">
                <p class="font-medium">Contact information saved</p>
                <p class="text-sm">{currentCart?.shippingFullName}</p>
                <p class="text-sm">{currentCart?.customerEmail}</p>
              </Alert>
            {:else}
              <form method="POST" action="?/setContactInfo" use:enhance>
                <div class="space-y-4">
                  <div>
                    <Label for="fullName">
                      Full Name <span class="text-red-500">*</span>
                    </Label>
                    <Input
                      type="text"
                      id="fullName"
                      name="fullName"
                      bind:value={contactFormData.fullName}
                      required
                      class="mt-1"
                    />
                  </div>

                  <div>
                    <Label for="email">
                      Email Address <span class="text-red-500">*</span>
                    </Label>
                    <Input
                      type="email"
                      id="email"
                      name="email"
                      bind:value={contactFormData.email}
                      required
                      class="mt-1"
                    />
                  </div>

                  <Button type="submit" class="w-full">Continue to Payment</Button>
                </div>
              </form>
            {/if}
          </div>
        {:else}
          <!-- Shipping Address for Physical Products -->
          <div>
            <h2 class="mb-4 text-xl font-semibold">Shipping Address</h2>

            {#if showAddressPicker}
              <!-- Hidden form for auto-selecting default address -->
              {@const defaultAddress =
                savedAddresses.find((a: (typeof savedAddresses)[0]) => a.isDefault) ||
                savedAddresses[0]}
              <form
                method="POST"
                action="?/useSavedAddress"
                use:enhance
                bind:this={autoSelectForm}
                class="hidden"
              >
                <input type="hidden" name="addressId" value={defaultAddress?.id} />
              </form>

              <!-- Saved Addresses Picker -->
              <div class="mb-4 space-y-3">
                {#each savedAddresses as address}
                  <form method="POST" action="?/useSavedAddress" use:enhance>
                    <input type="hidden" name="addressId" value={address.id} />
                    <Button
                      type="submit"
                      variant="outline"
                      class="h-auto w-full justify-start p-4 text-left hover:border-blue-500 hover:bg-blue-50"
                    >
                      <div class="flex w-full items-start justify-between">
                        <div>
                          {#if address.fullName}
                            <p class="font-medium">{address.fullName}</p>
                          {/if}
                          <p class="text-sm text-gray-600">{address.streetLine1}</p>
                          {#if address.streetLine2}
                            <p class="text-sm text-gray-600">{address.streetLine2}</p>
                          {/if}
                          <p class="text-sm text-gray-600">{address.postalCode} {address.city}</p>
                          <p class="text-sm text-gray-600">{address.country}</p>
                        </div>
                        {#if address.isDefault}
                          <span
                            class="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800"
                          >
                            Default
                          </span>
                        {/if}
                      </div>
                    </Button>
                  </form>
                {/each}
              </div>

              <button
                type="button"
                class="text-sm text-blue-600 hover:underline"
                onclick={() => (preferManualEntry = true)}
              >
                + Use a different address
              </button>
            {:else if cartHasAddress && !isEditingAddress}
              <!-- Address Summary (read-only) -->
              <div class="rounded-lg border border-gray-200 p-4">
                <div class="flex items-start justify-between">
                  <div>
                    {#if currentCart?.shippingFullName}
                      <p class="font-medium">{currentCart.shippingFullName}</p>
                    {/if}
                    <p class="text-sm text-gray-600">{currentCart?.shippingStreetLine1}</p>
                    <p class="text-sm text-gray-600">
                      {currentCart?.shippingPostalCode}
                      {currentCart?.shippingCity}
                    </p>
                    <p class="text-sm text-gray-600">{currentCart?.shippingCountry}</p>
                  </div>
                  <button
                    type="button"
                    class="text-sm text-blue-600 hover:underline"
                    onclick={() => {
                      // Pre-fill form with current values
                      addressFormData = {
                        fullName: currentCart?.shippingFullName ?? "",
                        streetLine1: currentCart?.shippingStreetLine1 ?? "",
                        city: currentCart?.shippingCity ?? "",
                        postalCode: currentCart?.shippingPostalCode ?? "",
                        country: currentCart?.shippingCountry ?? "FI"
                      };
                      isEditingAddress = true;
                    }}
                  >
                    Edit
                  </button>
                </div>
              </div>
            {:else}
              <!-- Address Form -->
              <form
                method="POST"
                action="?/setShippingAddress"
                use:enhance={() => {
                  return async ({ update }) => {
                    await update({ reset: false });
                    isEditingAddress = false;
                  };
                }}
              >
                <div class="space-y-4">
                  <div>
                    <Label for="fullName">
                      Full Name <span class="text-red-500">*</span>
                    </Label>
                    <Input
                      type="text"
                      id="fullName"
                      name="fullName"
                      bind:value={addressFormData.fullName}
                      required
                      class="mt-1"
                    />
                  </div>

                  <div>
                    <Label for="streetLine1">
                      Street Address <span class="text-red-500">*</span>
                    </Label>
                    <Input
                      type="text"
                      id="streetLine1"
                      name="streetLine1"
                      bind:value={addressFormData.streetLine1}
                      required
                      class="mt-1"
                    />
                  </div>

                  <div class="grid grid-cols-2 gap-4">
                    <div>
                      <Label for="postalCode">
                        Postal Code <span class="text-red-500">*</span>
                      </Label>
                      <Input
                        type="text"
                        id="postalCode"
                        name="postalCode"
                        bind:value={addressFormData.postalCode}
                        required
                        class="mt-1"
                      />
                    </div>

                    <div>
                      <Label for="city">
                        City <span class="text-red-500">*</span>
                      </Label>
                      <Input
                        type="text"
                        id="city"
                        name="city"
                        bind:value={addressFormData.city}
                        required
                        class="mt-1"
                      />
                    </div>
                  </div>

                  <div>
                    <Label for="country">
                      Country <span class="text-red-500">*</span>
                    </Label>
                    <select
                      id="country"
                      name="country"
                      bind:value={addressFormData.country}
                      required
                      class="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
                    >
                      <option value="FI">Finland</option>
                      <option value="SE">Sweden</option>
                      <option value="NO">Norway</option>
                      <option value="DK">Denmark</option>
                    </select>
                  </div>

                  {#if data.isLoggedIn}
                    <label class="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="saveAddressForFuture"
                        bind:checked={saveAddressForFuture}
                        class="h-4 w-4 rounded border-gray-300 text-blue-600"
                      />
                      <span class="text-sm text-gray-700">Save this address for future orders</span>
                    </label>
                  {/if}

                  <div class="flex gap-3">
                    {#if isEditingAddress}
                      <Button
                        type="button"
                        variant="outline"
                        class="flex-1"
                        onclick={() => (isEditingAddress = false)}
                      >
                        Cancel
                      </Button>
                    {/if}
                    <Button type="submit" class="flex-1">
                      {isEditingAddress ? "Update Address" : "Continue"}
                    </Button>
                  </div>
                </div>
              </form>

              {#if savedAddresses.length > 0 && !cartHasAddress && !isEditingAddress}
                <button
                  type="button"
                  class="mt-4 text-sm text-gray-600 hover:text-gray-800"
                  onclick={() => (preferManualEntry = false)}
                >
                  &larr; Use a saved address
                </button>
              {/if}
            {/if}
          </div>

          <!-- Shipping Method Selection (only for physical products) -->
          {#if currentCart?.shippingPostalCode && currentShippingRates.length > 0}
            <div>
              <h2 class="mb-4 text-xl font-semibold">Shipping Method</h2>

              {#if currentOrderShipping && !isEditingShipping}
                <!-- Shipping Method Summary (read-only) -->
                {@const selectedRate = currentShippingRates.find(
                  (r: (typeof currentShippingRates)[number]) =>
                    r.methodId === currentOrderShipping?.shippingMethodId
                )}
                <div class="rounded-lg border border-gray-200 p-4">
                  <div class="flex items-start justify-between">
                    <div>
                      <p class="font-medium">{selectedRate?.name || "Selected"}</p>
                      {#if selectedRate?.description}
                        <p class="mt-1 text-sm text-gray-500">{selectedRate.description}</p>
                      {/if}
                      {#if selectedRate?.estimatedDeliveryDays}
                        <p class="mt-1 text-sm text-gray-500">
                          Estimated delivery: {selectedRate.estimatedDeliveryDays} business day{selectedRate.estimatedDeliveryDays !==
                          1
                            ? "s"
                            : ""}
                        </p>
                      {/if}
                      <p class="mt-1 font-semibold">{formatPrice(selectedRate?.price ?? 0)}</p>
                    </div>
                    <button
                      type="button"
                      class="text-sm text-blue-600 hover:underline"
                      onclick={() => {
                        selectedShippingRate = selectedRate ?? null;
                        isEditingShipping = true;
                      }}
                    >
                      Edit
                    </button>
                  </div>
                </div>
              {:else}
                <!-- Shipping Method Selection Form -->
                <div class="space-y-3">
                  {#each currentShippingRates as rate}
                    <label
                      class={cn(
                        "flex cursor-pointer items-start rounded-lg border p-4 transition-colors hover:bg-gray-50",
                        selectedShippingRate?.id === rate.id
                          ? "border-blue-500 bg-blue-50"
                          : "border-gray-300"
                      )}
                    >
                      <input
                        type="radio"
                        name="shippingMethod"
                        value={rate.id}
                        checked={selectedShippingRate?.id === rate.id}
                        onchange={() => selectShippingRate(rate)}
                        class="mt-1 mr-3"
                      />
                      <div class="flex-1">
                        <div class="flex items-start justify-between">
                          <div>
                            <p class="font-medium">{rate.name}</p>
                            {#if rate.description}
                              <p class="mt-1 text-sm text-gray-500">{rate.description}</p>
                            {/if}
                            {#if rate.estimatedDeliveryDays}
                              <p class="mt-1 text-sm text-gray-500">
                                Estimated delivery: {rate.estimatedDeliveryDays} business day{rate.estimatedDeliveryDays !==
                                1
                                  ? "s"
                                  : ""}
                              </p>
                            {/if}
                          </div>
                          <p class="ml-4 font-semibold">{formatPrice(rate.price)}</p>
                        </div>
                      </div>
                    </label>
                  {/each}
                </div>

                {#if selectedShippingRate}
                  <form
                    method="POST"
                    action="?/setShippingMethod"
                    use:enhance={() => {
                      return async ({ update }) => {
                        await update({ reset: false });
                        isEditingShipping = false;
                      };
                    }}
                    class="mt-4"
                  >
                    <input type="hidden" name="methodId" value={selectedShippingRate.methodId} />
                    <input type="hidden" name="rateId" value={selectedShippingRate.id} />
                    <input type="hidden" name="price" value={selectedShippingRate.price} />
                    <div class="flex gap-3">
                      {#if isEditingShipping}
                        <Button
                          type="button"
                          variant="outline"
                          class="flex-1"
                          onclick={() => {
                            // Reset to the currently saved rate
                            const savedRate = currentShippingRates.find(
                              (r: (typeof currentShippingRates)[number]) =>
                                r.methodId === currentOrderShipping?.shippingMethodId
                            );
                            selectedShippingRate = savedRate ?? null;
                            isEditingShipping = false;
                          }}
                        >
                          Cancel
                        </Button>
                      {/if}
                      <Button type="submit" class="flex-1">
                        {isEditingShipping ? "Update Shipping Method" : "Select Shipping Method"}
                      </Button>
                    </div>
                  </form>
                {/if}
              {/if}
            </div>
          {:else if currentCart?.shippingPostalCode}
            <Alert variant="warning">
              <p class="text-sm">
                No shipping methods available for this address. Please check your address.
              </p>
            </Alert>
          {:else}
            <Alert variant="default">
              <p class="text-sm">
                Please enter your shipping address to see available shipping methods.
              </p>
            </Alert>
          {/if}
        {/if}

        <!-- Payment Method Selection -->
        {#if (isDigitalOnly && contactInfoSet && currentPaymentMethods?.length > 0) || (!isDigitalOnly && currentCart?.shippingPostalCode && currentOrderShipping && currentPaymentMethods?.length > 0)}
          <div>
            <h2 class="mb-4 text-xl font-semibold">Payment Method</h2>

            <div class="space-y-3">
              {#each currentPaymentMethods as method}
                <label
                  class={cn(
                    "flex cursor-pointer items-start rounded-lg border p-4 transition-colors hover:bg-gray-50",
                    selectedPaymentMethod?.id === method.id
                      ? "border-blue-500 bg-blue-50"
                      : "border-gray-300"
                  )}
                >
                  <input
                    type="radio"
                    name="paymentMethod"
                    value={method.id}
                    checked={selectedPaymentMethod?.id === method.id}
                    onchange={() => (selectedPaymentMethod = method)}
                    class="mt-1 mr-3"
                  />
                  <div class="flex-1">
                    <p class="font-medium">{method.name}</p>
                    {#if method.description}
                      <p class="mt-1 text-sm text-gray-500">{method.description}</p>
                    {/if}
                  </div>
                </label>
              {/each}
            </div>

            {#if !currentPaymentInfo}
              <form
                method="POST"
                action="?/createPayment"
                use:enhance={() => {
                  isProcessingPayment = true;
                  return async ({ update }) => {
                    isProcessingPayment = false;
                    await update();
                  };
                }}
                class="mt-4"
              >
                <input
                  type="hidden"
                  name="paymentMethodId"
                  value={selectedPaymentMethod?.id ?? ""}
                />
                {#if saveAddressForFuture}
                  <input type="hidden" name="saveToAddressBook" value="on" />
                {/if}
                <Button
                  type="submit"
                  disabled={!selectedPaymentMethod || isProcessingPayment}
                  class="w-full"
                >
                  {isProcessingPayment ? "Processing..." : "Place Order"}
                </Button>
              </form>
            {:else if currentPaymentInfo?.methodCode === "stripe" && currentPaymentInfo?.clientSecret}
              <div class="mt-4">
                <StripePayment
                  clientSecret={currentPaymentInfo.clientSecret}
                  onready={(stripe, elements) => {
                    stripeRef = stripe;
                    elementsRef = elements;
                  }}
                />
              </div>
            {/if}
          </div>
        {:else if !isDigitalOnly && currentCart?.shippingPostalCode && !currentOrderShipping}
          <Alert variant="default">
            <p class="text-sm">Please select a shipping method first to see payment options.</p>
          </Alert>
        {:else if isDigitalOnly && !contactInfoSet}
          <Alert variant="default">
            <p class="text-sm">Please enter your contact information to see payment options.</p>
          </Alert>
        {/if}

        <!-- Complete Order (Stripe only) -->
        {#if currentPaymentInfo?.methodCode === "stripe"}
          <div>
            {#if form?.stockErrors?.length}
              <Alert variant="destructive" class="mb-4">
                <p class="mb-2 font-medium">Stock Issue</p>
                <ul class="list-inside list-disc text-sm">
                  {#each form.stockErrors as stockError}
                    <li>{stockError}</li>
                  {/each}
                </ul>
                <p class="mt-2 text-sm">Please adjust quantities in your cart.</p>
              </Alert>
            {/if}
            {#if stripeError}
              <Alert variant="destructive" class="mb-4">
                <p class="text-sm">{stripeError}</p>
              </Alert>
            {/if}
            <form
              method="POST"
              action="?/completeOrder"
              bind:this={completeOrderForm}
              use:enhance={({ cancel }) => {
                isCompletingOrder = true;
                stripeError = null;

                // For Stripe payments, confirm on client side first (skip if already confirmed)
                if (stripeRef && elementsRef && !stripeConfirmed) {
                  cancel();

                  stripeRef
                    .confirmPayment({
                      elements: elementsRef,
                      redirect: "if_required"
                    })
                    .then(({ error }) => {
                      if (error) {
                        stripeError = error.message ?? "Payment failed";
                        isCompletingOrder = false;
                      } else {
                        // Stripe succeeded, resubmit to let server complete the order
                        stripeConfirmed = true;
                        completeOrderForm?.requestSubmit();
                      }
                    })
                    .catch((e: unknown) => {
                      stripeError = e instanceof Error ? e.message : "Payment failed";
                      isCompletingOrder = false;
                    });

                  return;
                }

                // Stripe already confirmed, submit directly
                return async ({ update }) => {
                  isCompletingOrder = false;
                  stripeConfirmed = false;
                  await update();
                };
              }}
            >
              {#if saveAddressForFuture}
                <input type="hidden" name="saveToAddressBook" value="on" />
              {/if}
              <Button
                type="submit"
                disabled={isCompletingOrder}
                class="w-full bg-green-600 hover:bg-green-700"
              >
                {isCompletingOrder ? "Completing Order..." : "Complete Order"}
              </Button>
            </form>
          </div>
        {/if}
      </div>

      <!-- Order Summary -->
      <div class="lg:col-span-2">
        <div class="sticky top-4 rounded-lg border border-gray-200 bg-gray-50 p-6">
          <h2 class="text-lg font-semibold">Order Summary</h2>

          <!-- Line Items -->
          <div class="mt-5 divide-y divide-gray-200">
            {#each currentCart.lines as line}
              <div class="flex gap-4 py-4 first:pt-0 last:pb-0">
                <div class="relative shrink-0">
                  <div class="h-16 w-16 overflow-hidden rounded-lg border border-gray-200 bg-white">
                    {#if line.imageUrl}
                      <img
                        src={imageUrl(line.imageUrl, 128)}
                        alt={line.productName}
                        class="h-full w-full object-cover"
                      />
                    {:else}
                      <div class="flex h-full w-full items-center justify-center">
                        <ShoppingCart class="h-5 w-5 text-gray-300" />
                      </div>
                    {/if}
                  </div>
                  <span
                    class="absolute -top-2 -right-2 flex h-5 w-5 items-center justify-center rounded-full bg-gray-600 text-[11px] font-medium text-white shadow-sm"
                  >
                    {line.quantity}
                  </span>
                </div>
                <div class="flex min-w-0 flex-1 items-center justify-between gap-3">
                  <div class="min-w-0">
                    <p class="text-sm font-medium text-gray-900">
                      {line.productName || "Untitled product"}
                    </p>
                    {#if line.variantName}
                      <p class="text-sm text-gray-500">{line.variantName}</p>
                    {/if}
                  </div>
                  <p class="shrink-0 text-sm font-medium text-gray-900">
                    {formatPrice(line.lineTotal)}
                  </p>
                </div>
              </div>
            {/each}
          </div>

          <!-- Promotions -->
          {#if currentAppliedPromotions.length > 0 || !currentAppliedPromotions.some((p: any) => p.method === "code")}
            <div class="mt-5 border-t border-gray-200 pt-5">
              {#if !currentAppliedPromotions.some((p: any) => p.method === "code")}
                <form
                  method="POST"
                  action="?/applyPromotion"
                  use:enhance={() => {
                    return async ({ update }) => {
                      await update({ reset: false });
                    };
                  }}
                  class="flex w-full gap-2"
                >
                  <input
                    type="text"
                    name="promoCode"
                    bind:value={promoCode}
                    placeholder="Promo code"
                    class="min-w-0 flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm uppercase"
                  />
                  <Button type="submit" variant="outline" class="shrink-0">Apply</Button>
                </form>
                {#if form?.promoError}
                  <p class="text-xs text-red-600">{form.promoError}</p>
                {/if}
                {#if form?.promoSuccess}
                  <p class="text-xs text-green-600">{form.promoSuccess}</p>
                {/if}
              {/if}
            </div>
          {/if}

          <!-- Price Breakdown -->
          <div class="mt-5 space-y-2 border-t border-gray-200 pt-5">
            <div class="flex justify-between text-sm">
              <span class="text-gray-600">Subtotal</span>
              <span class="text-gray-900">{formatPrice(currentCart.subtotal)}</span>
            </div>

            {#if currentCart.discount > 0}
              <div class="flex justify-between text-sm">
                <span class="text-gray-600">Discount</span>
                <span class="font-medium text-green-600">
                  -{formatPrice(currentCart.discount)}
                </span>
              </div>
            {/if}

            {#if !isDigitalOnly}
              <div class="flex justify-between text-sm">
                <span class="text-gray-600">Shipping</span>
                {#if hasShippingPromo}
                  {@const shippingPromo = currentAppliedPromotions.find(
                    (p: any) => p.type === "shipping"
                  )}
                  <span>
                    {#if shippingPromo}
                      <span class="text-gray-400 line-through"
                        >{formatPrice(shippingPromo.discountAmount)}</span
                      >
                    {/if}
                    <span class="ml-1 font-medium text-green-600">Free</span>
                  </span>
                {:else}
                  <span class="text-gray-900">{formatPrice(currentCart.shipping)}</span>
                {/if}
              </div>
            {/if}

            {#if currentCart.taxTotal > 0}
              <div class="flex justify-between text-sm">
                <span class="text-gray-600">VAT (included)</span>
                <span class="text-gray-900">{formatPrice(currentCart.taxTotal)}</span>
              </div>
            {:else if currentCart.isTaxExempt}
              <div class="flex justify-between text-sm">
                <span class="text-gray-600">VAT</span>
                <span class="font-medium text-green-600">Tax exempt (B2B)</span>
              </div>
            {/if}
          </div>

          <!-- Total -->
          <div class="mt-4 border-t border-gray-300 pt-4">
            <div class="flex items-center justify-between">
              <span class="text-base font-semibold text-gray-900">Total</span>
              <span class="text-lg font-semibold text-gray-900">
                {formatPrice(currentCart.total)}
              </span>
            </div>
            {#if currentCart.isTaxExempt}
              <p class="mt-1 text-xs text-gray-500">
                Net amount: {formatPrice(currentCart.totalNet)} (VAT 0%)
              </p>
            {/if}
          </div>
        </div>
      </div>
    </div>
  {/if}
</div>
