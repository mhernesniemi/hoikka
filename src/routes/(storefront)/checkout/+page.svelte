<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { commandErrorMessage } from "$lib/utils";
  import {
    getCheckout,
    setShippingAddress,
    useSavedAddress,
    setContactInfo,
    setShippingMethod,
    applyPromotion,
    removePromotion,
    createPayment,
    completeOrder
  } from "$lib/remote/checkout.remote";
  import { Button } from "$lib/components/storefront/ui/button";
  import { Input } from "$lib/components/storefront/ui/input";
  import { Label } from "$lib/components/storefront/ui/label";
  import { Alert } from "$lib/components/storefront/ui/alert";
  import StripePayment from "$lib/components/storefront/StripePayment.svelte";
  import { formatPrice, cn } from "$lib/utils.js";
  import { imageUrl } from "$lib/image";
  import ShoppingCart from "@lucide/svelte/icons/shopping-cart";
  import LoaderCircle from "@lucide/svelte/icons/loader-circle";
  import type { Stripe, StripeElements } from "@stripe/stripe-js";
  import type { PageData } from "./$types.js";

  let { data }: { data: PageData } = $props();

  // A previous attempt captured (or may have captured) money but never
  // finished the order. The loader only detects that — actually completing is
  // money movement, so it runs here as a command the moment the page mounts.
  let resumeError = $state<string | null>(null);
  $effect(() => {
    if (!data.resuming) return;
    completeOrder({})
      .then((result) => {
        if (result.completed) return goto(`/checkout/thank-you?order=${result.orderCode}`);
        resumeError = result.error;
      })
      .catch((e) => (resumeError = commandErrorMessage(e)));
  });

  // The single source of truth: refreshed server-side by every mutation
  // command (single-flight), so there is no form/data reconciliation here.
  const checkoutQuery = getCheckout();
  const checkout = $derived(checkoutQuery.current);
  const isLoading = $derived(checkout === undefined);

  type CheckoutData = NonNullable<typeof checkoutQuery.current>;
  type ShippingRateView = CheckoutData["shippingRates"][number];
  type PaymentMethodView = CheckoutData["paymentMethods"][number];

  const cart = $derived(checkout?.cart ?? null);
  const isDigitalOnly = $derived(checkout?.isDigitalOnly ?? false);
  const shippingRates = $derived(checkout?.shippingRates ?? []);
  const orderShipping = $derived(checkout?.orderShipping ?? null);
  const paymentMethods = $derived(checkout?.paymentMethods ?? []);
  const savedAddresses = $derived(checkout?.savedAddresses ?? []);
  const appliedPromotions = $derived(checkout?.appliedPromotions ?? []);

  const contactInfoSet = $derived(isDigitalOnly && !!cart?.customerEmail);
  const cartHasAddress = $derived(!!cart?.shippingPostalCode);
  const hasShippingPromo = $derived(appliedPromotions.some((p) => p.type === "shipping"));
  const appliedCodePromo = $derived(appliedPromotions.find((p) => p.method === "code") ?? null);

  // Notice shown when a redirect payment provider sends the shopper back
  // without a completed payment (provider return routes redirect to
  // /checkout?payment=cancelled|error)
  const paymentReturnNotice = $derived.by(() => {
    const status = page.url.searchParams.get("payment");
    if (status === "cancelled") return "The payment was cancelled. You can try again.";
    if (status === "error") return "Completing the payment failed. Please try again.";
    return null;
  });

  // Errors from commands (validation, stock, payment failures)
  let errorMessage = $state<string | null>(null);
  let actionStockErrors = $state<string[]>([]);

  // Shipping rate selection: default to the rate already saved on the order,
  // with a local override for the user's in-progress pick.
  let shippingRateOverride = $state<ShippingRateView | null>(null);
  const savedShippingRate = $derived(
    shippingRates.find((r) => r.methodId === orderShipping?.shippingMethodId) ?? null
  );
  const selectedShippingRate = $derived(shippingRateOverride ?? savedShippingRate);

  // Payment method selection: default to the method of an in-progress Stripe
  // payment, with a local override for the user's pick.
  let paymentMethodOverride = $state<PaymentMethodView | null>(null);
  let paymentInfoCleared = $state(false);
  const currentPaymentInfo = $derived(paymentInfoCleared ? null : (checkout?.paymentInfo ?? null));
  const selectedPaymentMethod = $derived(
    paymentMethodOverride ??
      paymentMethods.find((m) => m.code === checkout?.paymentInfo?.methodCode) ??
      null
  );

  let isProcessingPayment = $state(false);
  let isCompletingOrder = $state(false);
  let stripeRef = $state<Stripe | null>(null);
  let elementsRef = $state<StripeElements | null>(null);
  let stripeError = $state<string | null>(null);
  let stripeConfirmed = $state(false);

  let promoCode = $state("");
  let promoError = $state<string | null>(null);
  let promoSuccess = $state<string | null>(null);

  // Local UI state
  let preferManualEntry = $state(false);
  let isEditingAddress = $state(false);
  let saveAddressForFuture = $state(false);
  let isEditingShipping = $state(false);
  const showAddressPicker = $derived(
    savedAddresses.length > 0 && !cartHasAddress && !preferManualEntry
  );

  // Form data for physical products (shipping address)
  let addressFormData = $state({
    fullName: "",
    streetLine1: "",
    city: "",
    postalCode: "",
    country: "FI"
  });

  // Form data for digital products (contact info)
  let contactFormData = $state({ fullName: "", email: "" });

  // One-shot setup when the query first resolves: prefill the forms and
  // apply the customer's default saved address (replacing the old
  // auto-submitting hidden form).
  let initialized = $state(false);
  $effect(() => {
    if (!checkout || initialized) return;
    initialized = true;

    addressFormData = {
      fullName: checkout.customerFullName ?? checkout.cart.shippingFullName ?? "",
      streetLine1: checkout.cart.shippingStreetLine1 ?? "",
      city: checkout.cart.shippingCity ?? "",
      postalCode: checkout.cart.shippingPostalCode ?? "",
      country: checkout.cart.shippingCountry ?? "FI"
    };
    contactFormData = {
      fullName: checkout.customerFullName ?? checkout.cart.shippingFullName ?? "",
      email: checkout.customerEmail ?? checkout.cart.customerEmail ?? ""
    };

    if (checkout.savedAddresses.length > 0 && !checkout.cart.shippingPostalCode) {
      const defaultAddress =
        checkout.savedAddresses.find((a) => a.isDefault) ?? checkout.savedAddresses[0];
      useSavedAddress({ addressId: defaultAddress.id }).catch((e) => (errorMessage = errMsg(e)));
    }
  });

  const errMsg = commandErrorMessage;

  /** Run a command, routing failures to the top-of-page error alert. */
  async function run(action: () => Promise<void>) {
    errorMessage = null;
    try {
      await action();
    } catch (e) {
      errorMessage = errMsg(e);
    }
  }

  /** Handle a completion result: navigate on success, show errors otherwise. */
  async function applyCompletion(
    result:
      | { completed: true; orderCode: string }
      | { completed: false; error: string; stockErrors?: string[] }
  ) {
    if (result.completed) {
      await goto(`/checkout/thank-you?order=${result.orderCode}`);
    } else {
      errorMessage = result.error;
      actionStockErrors = result.stockErrors ?? [];
    }
  }

  function submitAddress(event: SubmitEvent) {
    event.preventDefault();
    run(async () => {
      await setShippingAddress(addressFormData);
      isEditingAddress = false;
    });
  }

  const chooseSavedAddress = (addressId: number) => run(() => useSavedAddress({ addressId }));

  function submitContactInfo(event: SubmitEvent) {
    event.preventDefault();
    run(() => setContactInfo(contactFormData));
  }

  const submitShippingMethod = () =>
    run(async () => {
      if (!selectedShippingRate?.methodId) return;
      await setShippingMethod({
        methodId: selectedShippingRate.methodId,
        rateId: selectedShippingRate.id
      });
      shippingRateOverride = null; // the saved selection now comes from the query
      isEditingShipping = false;
    });

  function selectPaymentMethod(method: PaymentMethodView) {
    const previousMethod = selectedPaymentMethod;
    paymentMethodOverride = method;
    // Clear payment info when switching to a different method
    if (previousMethod && previousMethod.id !== method.id && currentPaymentInfo) {
      paymentInfoCleared = true;
    }
    // Start the payment for Stripe to load payment elements immediately
    if (method.code === "stripe" && (paymentInfoCleared || !checkout?.paymentInfo)) {
      startPayment(method);
    }
  }

  async function startPayment(method: PaymentMethodView) {
    isProcessingPayment = true;
    actionStockErrors = [];
    await run(async () => {
      const result = await createPayment({
        paymentMethodId: method.id,
        saveToAddressBook: saveAddressForFuture
      });
      if ("paymentInfo" in result) {
        if (result.paymentInfo.redirectUrl) {
          // Redirect providers: hand the shopper to the hosted payment page;
          // the provider's return route completes the order
          window.location.assign(result.paymentInfo.redirectUrl);
          return;
        }
        // Stripe: the refreshed query now carries the client secret
        paymentInfoCleared = false;
      } else {
        await applyCompletion(result);
      }
    });
    isProcessingPayment = false;
  }

  async function handleCompleteOrder() {
    isCompletingOrder = true;
    stripeError = null;
    errorMessage = null;
    actionStockErrors = [];
    try {
      // For Stripe payments, confirm on client side first (skip if already confirmed)
      if (stripeRef && elementsRef && !stripeConfirmed) {
        const { error } = await stripeRef.confirmPayment({
          elements: elementsRef,
          redirect: "if_required"
        });
        if (error) {
          stripeError = error.message ?? "Payment failed";
          return;
        }
        stripeConfirmed = true;
      }
      await applyCompletion(await completeOrder({ saveToAddressBook: saveAddressForFuture }));
    } catch (e) {
      stripeError = errMsg(e);
    } finally {
      isCompletingOrder = false;
    }
  }

  async function submitPromo(event: SubmitEvent) {
    event.preventDefault();
    promoError = null;
    promoSuccess = null;
    const code = promoCode.trim();
    if (!code) {
      promoError = "Please enter a promotion code";
      return;
    }
    try {
      const result = await applyPromotion({ code });
      if (result.ok) {
        promoSuccess = result.message;
        promoCode = "";
      } else {
        promoError = result.message;
      }
    } catch (e) {
      promoError = errMsg(e);
    }
  }

  async function removePromo() {
    promoError = null;
    promoSuccess = null;
    try {
      await removePromotion();
    } catch (e) {
      promoError = errMsg(e);
    }
  }
</script>

<svelte:head>
  <title>Checkout | Hoikka</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<div class="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
  <h1 class="mb-8 text-3xl font-bold">Checkout</h1>

  {#if data.resuming}
    {#if resumeError}
      <Alert variant="warning">
        <p class="font-medium">We couldn't finish your previous order</p>
        <p class="mt-1 text-sm">{resumeError}</p>
      </Alert>
    {:else}
      <div class="flex items-center justify-center py-16">
        <LoaderCircle class="h-6 w-6 animate-spin text-gray-400" />
        <span class="ml-2 text-sm text-gray-500">Finishing your previous order...</span>
      </div>
    {/if}
  {:else if data.empty}
    <p class="mb-4 text-gray-500">Your cart is empty</p>
    <a href="/products" class="text-blue-600 underline hover:text-blue-700">Browse products</a>
  {:else if isLoading}
    <div class="flex items-center justify-center py-16">
      <LoaderCircle class="h-6 w-6 animate-spin text-gray-400" />
      <span class="ml-2 text-sm text-gray-500">Loading checkout...</span>
    </div>
  {:else if !cart || cart.lines.length === 0}
    <p class="mb-4 text-gray-500">Your cart is empty</p>
    <a href="/products" class="text-blue-600 underline hover:text-blue-700">Browse products</a>
  {:else}
    <div class="grid grid-cols-1 gap-8 lg:grid-cols-5">
      <!-- Main Content -->
      <div class="space-y-10 lg:col-span-3">
        {#if paymentReturnNotice && !errorMessage}
          <Alert variant="warning">
            <p>{paymentReturnNotice}</p>
          </Alert>
        {/if}

        {#if data.stockErrors.length > 0}
          <Alert variant="warning">
            <p class="font-medium">Some items in your cart were adjusted</p>
            <ul class="mt-2 list-inside list-disc text-sm">
              {#each data.stockErrors as stockError}
                <li>{stockError}</li>
              {/each}
            </ul>
          </Alert>
        {/if}

        {#if errorMessage}
          <Alert variant="destructive">
            <p>{errorMessage}</p>
            {#if actionStockErrors.length}
              <ul class="mt-2 list-inside list-disc text-sm">
                {#each actionStockErrors as stockError}
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
                <p class="text-sm">{cart.shippingFullName}</p>
                <p class="text-sm">{cart.customerEmail}</p>
              </Alert>
            {:else}
              <form data-testid="contact-form" onsubmit={submitContactInfo}>
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
              <!-- Saved Addresses Picker -->
              <div class="mb-4 space-y-3">
                {#each savedAddresses as address}
                  <Button
                    type="button"
                    variant="outline"
                    class="h-auto w-full justify-start p-4 text-left hover:border-blue-500 hover:bg-blue-50"
                    onclick={() => chooseSavedAddress(address.id)}
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
                    {#if cart.shippingFullName}
                      <p class="font-medium">{cart.shippingFullName}</p>
                    {/if}
                    <p class="text-sm text-gray-600">{cart.shippingStreetLine1}</p>
                    <p class="text-sm text-gray-600">
                      {cart.shippingPostalCode}
                      {cart.shippingCity}
                    </p>
                    <p class="text-sm text-gray-600">{cart.shippingCountry}</p>
                  </div>
                  <button
                    type="button"
                    class="text-sm text-blue-600 hover:underline"
                    onclick={() => {
                      // Pre-fill form with current values
                      addressFormData = {
                        fullName: cart?.shippingFullName ?? "",
                        streetLine1: cart?.shippingStreetLine1 ?? "",
                        city: cart?.shippingCity ?? "",
                        postalCode: cart?.shippingPostalCode ?? "",
                        country: cart?.shippingCountry ?? "FI"
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
              <form data-testid="address-form" onsubmit={submitAddress}>
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

                  {#if checkout?.isLoggedIn}
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
          {#if cartHasAddress && shippingRates.length > 0}
            <div>
              <h2 class="mb-4 text-xl font-semibold">Shipping Method</h2>

              {#if orderShipping && !isEditingShipping}
                <!-- Shipping Method Summary (read-only) -->
                <div class="rounded-lg border border-gray-200 p-4">
                  <div class="flex items-start justify-between">
                    <div>
                      <p class="font-medium">{savedShippingRate?.name || "Selected"}</p>
                      {#if savedShippingRate?.description}
                        <p class="mt-1 text-sm text-gray-500">{savedShippingRate.description}</p>
                      {/if}
                      {#if savedShippingRate?.estimatedDeliveryDays}
                        <p class="mt-1 text-sm text-gray-500">
                          Estimated delivery: {savedShippingRate.estimatedDeliveryDays} business day{savedShippingRate.estimatedDeliveryDays !==
                          1
                            ? "s"
                            : ""}
                        </p>
                      {/if}
                      <p class="mt-1 font-semibold">{formatPrice(savedShippingRate?.price ?? 0)}</p>
                    </div>
                    <button
                      type="button"
                      class="text-sm text-blue-600 hover:underline"
                      onclick={() => (isEditingShipping = true)}
                    >
                      Edit
                    </button>
                  </div>
                </div>
              {:else}
                <!-- Shipping Method Selection -->
                <div class="space-y-3">
                  {#each shippingRates as rate}
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
                        onchange={() => (shippingRateOverride = rate)}
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
                  <div class="mt-4 flex gap-3">
                    {#if isEditingShipping}
                      <Button
                        type="button"
                        variant="outline"
                        class="flex-1"
                        onclick={() => {
                          // Reset to the currently saved rate
                          shippingRateOverride = null;
                          isEditingShipping = false;
                        }}
                      >
                        Cancel
                      </Button>
                    {/if}
                    <Button type="button" class="flex-1" onclick={submitShippingMethod}>
                      {isEditingShipping ? "Update Shipping Method" : "Select Shipping Method"}
                    </Button>
                  </div>
                {/if}
              {/if}
            </div>
          {:else if cartHasAddress}
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
        {#if (isDigitalOnly && contactInfoSet && paymentMethods.length > 0) || (!isDigitalOnly && cartHasAddress && orderShipping && paymentMethods.length > 0)}
          <div>
            <h2 class="mb-4 text-xl font-semibold">Payment Method</h2>

            <div class="space-y-3">
              {#each paymentMethods as method}
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
                    onchange={() => selectPaymentMethod(method)}
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
              <div class="mt-4">
                {#if selectedPaymentMethod?.code === "mock"}
                  <Button
                    type="button"
                    disabled={isProcessingPayment}
                    class="w-full"
                    onclick={() => selectedPaymentMethod && startPayment(selectedPaymentMethod)}
                  >
                    {isProcessingPayment ? "Processing..." : "Place order"}
                  </Button>
                {:else if selectedPaymentMethod && selectedPaymentMethod.code !== "stripe"}
                  <!-- Redirect providers (PayPal, Klarna, Paytrail, ...): the
                       provider returns a redirectUrl and startPayment navigates
                       to the hosted payment page. Instant providers complete
                       inline through the same call. -->
                  <Button
                    type="button"
                    disabled={isProcessingPayment}
                    class="w-full"
                    onclick={() => selectedPaymentMethod && startPayment(selectedPaymentMethod)}
                  >
                    {isProcessingPayment ? "Redirecting..." : "Continue to payment"}
                  </Button>
                {:else if isProcessingPayment}
                  <p class="text-center text-sm text-gray-500">Loading payment options...</p>
                {/if}
              </div>
            {:else if currentPaymentInfo.redirectUrl}
              <div class="mt-4">
                <Button
                  type="button"
                  class="w-full"
                  onclick={() =>
                    currentPaymentInfo?.redirectUrl &&
                    window.location.assign(currentPaymentInfo.redirectUrl)}
                >
                  Continue to payment
                </Button>
                <p class="mt-2 text-center text-xs text-gray-500">
                  You will be redirected to the payment provider.
                </p>
              </div>
            {:else if currentPaymentInfo.methodCode === "stripe" && currentPaymentInfo.clientSecret}
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
        {:else if !isDigitalOnly && cartHasAddress && !orderShipping}
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
            {#if stripeError}
              <Alert variant="destructive" class="mb-4">
                <p class="text-sm">{stripeError}</p>
              </Alert>
            {/if}
            <Button
              type="button"
              disabled={isCompletingOrder}
              class="w-full"
              onclick={handleCompleteOrder}
            >
              {isCompletingOrder ? "Completing Order..." : "Complete Order"}
            </Button>
          </div>
        {/if}
      </div>

      <!-- Order Summary -->
      <div class="lg:col-span-2">
        <div class="sticky top-4 rounded-lg border border-gray-200 bg-gray-50 p-6">
          <h2 class="text-lg font-semibold">Order Summary</h2>

          <!-- Line Items -->
          <div class="mt-5 divide-y divide-gray-200">
            {#each cart.lines as line}
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
          <div class="mt-5 border-t border-gray-200 pt-5">
            {#if appliedCodePromo}
              <div class="flex items-center justify-between text-sm">
                <span class="text-gray-600">
                  Promo code
                  <span class="font-medium text-gray-900">{appliedCodePromo.code}</span>
                </span>
                <button type="button" class="text-blue-600 hover:underline" onclick={removePromo}>
                  Remove
                </button>
              </div>
            {:else}
              <form onsubmit={submitPromo} class="flex w-full gap-2">
                <input
                  type="text"
                  name="promoCode"
                  bind:value={promoCode}
                  placeholder="Promo code"
                  class="min-w-0 flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm uppercase"
                />
                <Button type="submit" variant="outline" class="shrink-0">Apply</Button>
              </form>
            {/if}
            {#if promoError}
              <p class="mt-2 text-xs text-red-600">{promoError}</p>
            {/if}
            {#if promoSuccess}
              <p class="mt-2 text-xs text-green-600">{promoSuccess}</p>
            {/if}
          </div>

          <!-- Price Breakdown -->
          <div class="mt-5 space-y-2 border-t border-gray-200 pt-5">
            <div class="flex justify-between text-sm">
              <span class="text-gray-600">Subtotal</span>
              <span class="text-gray-900">{formatPrice(cart.subtotal)}</span>
            </div>

            {#if cart.discount > 0}
              <div class="flex justify-between text-sm">
                <span class="text-gray-600">Discount</span>
                <span class="font-medium text-green-600">
                  -{formatPrice(cart.discount)}
                </span>
              </div>
            {/if}

            {#if !isDigitalOnly}
              <div class="flex justify-between text-sm">
                <span class="text-gray-600">Shipping</span>
                {#if hasShippingPromo}
                  {@const shippingPromo = appliedPromotions.find((p) => p.type === "shipping")}
                  <span>
                    {#if shippingPromo}
                      <span class="text-gray-400 line-through"
                        >{formatPrice(shippingPromo.discountAmount)}</span
                      >
                    {/if}
                    <span class="ml-1 font-medium text-green-600">Free</span>
                  </span>
                {:else}
                  <span class="text-gray-900">{formatPrice(cart.shipping)}</span>
                {/if}
              </div>
            {/if}

            {#if cart.taxTotal > 0}
              <div class="flex justify-between text-sm">
                <span class="text-gray-600">VAT (included)</span>
                <span class="text-gray-900">{formatPrice(cart.taxTotal)}</span>
              </div>
            {:else if cart.isTaxExempt}
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
                {formatPrice(cart.total)}
              </span>
            </div>
            {#if cart.isTaxExempt}
              <p class="mt-1 text-xs text-gray-500">
                Net amount: {formatPrice(cart.totalNet)} (VAT 0%)
              </p>
            {/if}
          </div>
        </div>
      </div>
    </div>
  {/if}
</div>
