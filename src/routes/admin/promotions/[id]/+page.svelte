<script lang="ts">
  import { enhance } from "$app/forms";
  import { page } from "$app/stores";
  import { cn } from "$lib/utils";
  import { onMount } from "svelte";
  import { Button } from "$lib/components/admin/ui/button";
  import { Checkbox } from "$lib/components/admin/ui/checkbox";
  import { Input } from "$lib/components/admin/ui/input";
  import { Label } from "$lib/components/admin/ui/label";
  import { SelectNative } from "$lib/components/admin/ui/select-native";
  import DeleteConfirmDialog from "$lib/components/admin/DeleteConfirmDialog.svelte";
  import AdminCard from "$lib/components/admin/AdminCard.svelte";
  import { Badge } from "$lib/components/admin/ui/badge";
  import * as Popover from "$lib/components/admin/ui/popover";
  import * as Command from "$lib/components/admin/ui/command";
  import UnsavedChangesDialog from "$lib/components/admin/UnsavedChangesDialog.svelte";
  import type { PageData, ActionData } from "./$types";
  import { toast } from "svelte-sonner";
  import ChevronsUpDown from "@lucide/svelte/icons/chevrons-up-down";
  import Check from "@lucide/svelte/icons/check";
  import X from "@lucide/svelte/icons/x";
  import ChevronLeft from "@lucide/svelte/icons/chevron-left";

  let { data, form }: { data: PageData; form: ActionData } = $props();

  let promo = $derived(data.promotion);

  let discountType = $state(promo.discountType);
  let appliesTo = $state(promo.appliesTo);
  let selectedProductIds = $state<number[]>(promo.products.map((p) => p.productId));
  let selectedCollectionIds = $state<number[]>(promo.collections.map((c) => c.collectionId));
  let enabled = $state(promo.enabled);
  let combinesWithOtherPromotions = $state(promo.combinesWithOtherPromotions);
  let promoTitle = $state(promo.title ?? "");
  let discountValue = $state(
    promo.discountType === "fixed_amount" ? promo.discountValue / 100 : promo.discountValue
  );
  let minOrderAmount = $state(promo.minOrderAmount ? promo.minOrderAmount / 100 : "");
  let usageLimit = $state<number | string>(promo.usageLimit ?? "");
  let usageLimitPerCustomer = $state<number | string>(promo.usageLimitPerCustomer ?? "");
  let startsAt = $state(formatDateForInput(promo.startsAt));
  let endsAt = $state(formatDateForInput(promo.endsAt));
  let customerGroupId = $state(String(promo.customerGroupId ?? ""));
  let showDelete = $state(false);
  let productComboboxOpen = $state(false);
  let collectionComboboxOpen = $state(false);

  function toggleProduct(id: number) {
    if (selectedProductIds.includes(id)) {
      selectedProductIds = selectedProductIds.filter((p) => p !== id);
    } else {
      selectedProductIds = [...selectedProductIds, id];
    }
  }

  function toggleCollection(id: number) {
    if (selectedCollectionIds.includes(id)) {
      selectedCollectionIds = selectedCollectionIds.filter((c) => c !== id);
    } else {
      selectedCollectionIds = [...selectedCollectionIds, id];
    }
  }

  function getProductName(id: number): string {
    return data.products.find((p) => p.id === id)?.name ?? `Product #${id}`;
  }

  function getCollectionName(id: number): string {
    return data.collections.find((c) => c.id === id)?.name ?? `Collection #${id}`;
  }

  function formatPrice(cents: number): string {
    return (cents / 100).toFixed(2);
  }

  function formatDateForInput(date: Date | null): string {
    if (!date) return "";
    const d = new Date(date);
    // Format as YYYY-MM-DDTHH:mm for datetime-local input
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const hours = String(d.getHours()).padStart(2, "0");
    const minutes = String(d.getMinutes()).padStart(2, "0");
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  }

  const typeLabels: Record<string, string> = {
    order: "Amount off order",
    product: "Amount off products",
    free_shipping: "Free shipping"
  };

  const promoStatus = $derived.by(() => {
    if (!promo.enabled) return { label: "Disabled", variant: "secondary" as const };
    const now = new Date();
    if (promo.startsAt && new Date(promo.startsAt) > now)
      return { label: "Scheduled", variant: "warning" as const };
    if (promo.endsAt && new Date(promo.endsAt) < now)
      return { label: "Expired", variant: "destructive" as const };
    return { label: "Active", variant: "success" as const };
  });

  onMount(() => {
    if ($page.url.searchParams.has("created")) {
      toast.success("Promotion created successfully");
      history.replaceState({}, "", $page.url.pathname);
    }
  });

  $effect(() => {
    if (form?.error) toast.error(form.error);
  });

  const hasUnsavedChanges = $derived.by(() => {
    const origDiscountValue =
      promo.discountType === "fixed_amount" ? promo.discountValue / 100 : promo.discountValue;
    return (
      promoTitle !== (promo.title ?? "") ||
      discountType !== promo.discountType ||
      discountValue !== origDiscountValue ||
      appliesTo !== promo.appliesTo ||
      [...selectedProductIds].sort().join() !==
        promo.products
          .map((p) => p.productId)
          .sort()
          .join() ||
      [...selectedCollectionIds].sort().join() !==
        promo.collections
          .map((c) => c.collectionId)
          .sort()
          .join() ||
      enabled !== promo.enabled ||
      combinesWithOtherPromotions !== promo.combinesWithOtherPromotions ||
      minOrderAmount !== (promo.minOrderAmount ? promo.minOrderAmount / 100 : "") ||
      String(usageLimit) !== String(promo.usageLimit ?? "") ||
      String(usageLimitPerCustomer) !== String(promo.usageLimitPerCustomer ?? "") ||
      startsAt !== formatDateForInput(promo.startsAt) ||
      endsAt !== formatDateForInput(promo.endsAt) ||
      customerGroupId !== String(promo.customerGroupId ?? "")
    );
  });
</script>

<svelte:head><title>Edit {promo.code} | Admin</title></svelte:head>

<div class="space-y-6">
  <div class="mb-6 flex items-center justify-between">
    <a
      href="/admin/promotions"
      class="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline dark:text-blue-400"
      ><ChevronLeft class="h-4 w-4" /> Back to Promotions</a
    >
  </div>
  <div class="flex items-center justify-between">
    <div class="flex items-center gap-4">
      <h1 class="text-2xl font-bold">
        {promo.method === "automatic" ? promo.title : promo.code}
      </h1>
      <Badge variant="outline">{promo.method === "code" ? "Discount code" : "Automatic"}</Badge>
      <Badge variant="outline">{typeLabels[promo.promotionType]}</Badge>
      <Badge variant={promoStatus.variant}>{promoStatus.label}</Badge>
    </div>
    <Button type="submit" form="edit-form">Save Changes</Button>
  </div>

  <form
    method="POST"
    action="?/update"
    use:enhance={() => {
      return async ({ result, update }) => {
        await update({ reset: false });
        if (result.type === "success") {
          toast.success("Promotion updated");
        }
      };
    }}
    id="edit-form"
  >
    <input type="hidden" name="productIds" value={JSON.stringify(selectedProductIds)} />
    <input type="hidden" name="collectionIds" value={JSON.stringify(selectedCollectionIds)} />

    <div class="flex flex-col gap-6 lg:flex-row">
      <!-- Left Column -->
      <div class="flex-1 space-y-6">
        <!-- Code / Title -->
        <AdminCard title={promo.method === "code" ? "Promotion Code" : "Automatic Discount"}>
          {#if promo.method === "code"}
            <div>
              <Label for="code">Code</Label>
              <Input
                type="text"
                id="code"
                value={promo.code}
                disabled
                class="border-border bg-background text-muted-foreground"
              />
            </div>
          {:else}
            <div>
              <Label for="title">Title <span class="text-muted-foreground">(optional)</span></Label>
              <Input type="text" id="title" name="title" bind:value={promoTitle} />
              <p class="mt-1 text-xs text-muted-foreground">
                Customers will see this in their cart and at checkout.
              </p>
            </div>
          {/if}
        </AdminCard>

        <!-- Discount (hidden for free_shipping) -->
        {#if promo.promotionType !== "free_shipping"}
          <AdminCard title="Discount Value">
            <div class="grid grid-cols-2 gap-4">
              <div>
                <Label for="discountType">Discount Type</Label>
                <SelectNative id="discountType" name="discountType" bind:value={discountType}>
                  <option value="percentage">Percentage (%)</option>
                  <option value="fixed_amount">Fixed Amount (EUR)</option>
                </SelectNative>
              </div>
              <div>
                <Label for="discountValue">Value <span class="text-red-500">*</span></Label>
                <Input
                  type="number"
                  id="discountValue"
                  name="discountValue"
                  bind:value={discountValue}
                  min="0"
                  step={discountType === "percentage" ? "1" : "0.01"}
                  required
                />
              </div>
            </div>
          </AdminCard>
        {:else}
          <input type="hidden" name="discountType" value="fixed_amount" />
          <input type="hidden" name="discountValue" value="0" />
        {/if}

        <!-- Applies To (only for product type) -->
        {#if promo.promotionType === "product"}
          <AdminCard title="Applies To">
            <div class="space-y-3">
              <label class="flex items-center gap-2">
                <input
                  type="radio"
                  name="appliesTo"
                  value="all"
                  bind:group={appliesTo}
                  class="border-input-border bg-surface"
                />
                <span class="text-sm">All products</span>
              </label>
              <label class="flex items-center gap-2">
                <input
                  type="radio"
                  name="appliesTo"
                  value="specific_products"
                  bind:group={appliesTo}
                  class="border-input-border bg-surface"
                />
                <span class="text-sm">Specific products</span>
              </label>
              <label class="flex items-center gap-2">
                <input
                  type="radio"
                  name="appliesTo"
                  value="specific_collections"
                  bind:group={appliesTo}
                  class="border-input-border bg-surface"
                />
                <span class="text-sm">Specific collections</span>
              </label>
            </div>

            {#if appliesTo === "specific_products"}
              <div class="mt-4">
                <p class="mb-2 text-sm font-medium text-foreground-secondary">Select Products</p>
                <Popover.Root bind:open={productComboboxOpen}>
                  <Popover.Trigger
                    class="flex h-9 w-full items-center justify-between rounded-lg border border-input-border bg-surface px-3 py-2 text-sm hover:bg-hover"
                  >
                    <span class="text-muted-foreground">
                      {selectedProductIds.length > 0
                        ? `${selectedProductIds.length} product(s) selected`
                        : "Search products..."}
                    </span>
                    <ChevronsUpDown class="ml-2 h-4 w-4 shrink-0 text-placeholder" />
                  </Popover.Trigger>
                  <Popover.Content class="w-[var(--bits-popover-trigger-width)] p-0" align="start">
                    <Command.Root>
                      <Command.Input placeholder="Search products..." />
                      <Command.List class="max-h-60">
                        <Command.Empty>No products found.</Command.Empty>
                        {#each data.products as product}
                          <Command.Item
                            value={product.name}
                            onSelect={() => toggleProduct(product.id)}
                          >
                            <Check
                              class={cn(
                                "mr-2 h-4 w-4",
                                selectedProductIds.includes(product.id)
                                  ? "opacity-100"
                                  : "opacity-0"
                              )}
                            />
                            {product.name}
                          </Command.Item>
                        {/each}
                      </Command.List>
                    </Command.Root>
                  </Popover.Content>
                </Popover.Root>
                {#if selectedProductIds.length > 0}
                  <div class="mt-2 flex flex-wrap gap-1">
                    {#each selectedProductIds as id}
                      <Badge variant="secondary" class="gap-1">
                        {getProductName(id)}
                        <button
                          type="button"
                          onclick={() => toggleProduct(id)}
                          class="ml-0.5 rounded-full hover:bg-muted-strong"
                        >
                          <X class="h-3 w-3" />
                        </button>
                      </Badge>
                    {/each}
                  </div>
                {/if}
              </div>
            {/if}

            {#if appliesTo === "specific_collections"}
              <div class="mt-4">
                <p class="mb-2 text-sm font-medium text-foreground-secondary">Select Collections</p>
                <Popover.Root bind:open={collectionComboboxOpen}>
                  <Popover.Trigger
                    class="flex h-9 w-full items-center justify-between rounded-lg border border-input-border bg-surface px-3 py-2 text-sm hover:bg-hover"
                  >
                    <span class="text-muted-foreground">
                      {selectedCollectionIds.length > 0
                        ? `${selectedCollectionIds.length} collection(s) selected`
                        : "Search collections..."}
                    </span>
                    <ChevronsUpDown class="ml-2 h-4 w-4 shrink-0 text-placeholder" />
                  </Popover.Trigger>
                  <Popover.Content class="w-[var(--bits-popover-trigger-width)] p-0" align="start">
                    <Command.Root>
                      <Command.Input placeholder="Search collections..." />
                      <Command.List class="max-h-60">
                        <Command.Empty>No collections found.</Command.Empty>
                        {#each data.collections as collection}
                          <Command.Item
                            value={collection.name}
                            onSelect={() => toggleCollection(collection.id)}
                          >
                            <Check
                              class={cn(
                                "mr-2 h-4 w-4",
                                selectedCollectionIds.includes(collection.id)
                                  ? "opacity-100"
                                  : "opacity-0"
                              )}
                            />
                            {collection.name}
                          </Command.Item>
                        {/each}
                      </Command.List>
                    </Command.Root>
                  </Popover.Content>
                </Popover.Root>
                {#if selectedCollectionIds.length > 0}
                  <div class="mt-2 flex flex-wrap gap-1">
                    {#each selectedCollectionIds as id}
                      <Badge variant="secondary" class="gap-1">
                        {getCollectionName(id)}
                        <button
                          type="button"
                          onclick={() => toggleCollection(id)}
                          class="ml-0.5 rounded-full hover:bg-muted-strong"
                        >
                          <X class="h-3 w-3" />
                        </button>
                      </Badge>
                    {/each}
                  </div>
                {/if}
              </div>
            {/if}
          </AdminCard>
        {:else}
          <input type="hidden" name="appliesTo" value="all" />
        {/if}

        <!-- Conditions -->
        <AdminCard title="Conditions">
          <div class="grid grid-cols-3 gap-4">
            <div>
              <Label for="minOrderAmount">Min Order (EUR)</Label>
              <Input
                type="number"
                id="minOrderAmount"
                name="minOrderAmount"
                bind:value={minOrderAmount}
                placeholder="Optional"
                min="0"
                step="0.01"
              />
            </div>
            <div>
              <Label for="usageLimit">Total Usage Limit</Label>
              <Input
                type="number"
                id="usageLimit"
                name="usageLimit"
                bind:value={usageLimit}
                placeholder="Unlimited"
                min="0"
              />
            </div>
            <div>
              <Label for="usageLimitPerCustomer">Per Customer Limit</Label>
              <Input
                type="number"
                id="usageLimitPerCustomer"
                name="usageLimitPerCustomer"
                bind:value={usageLimitPerCustomer}
                placeholder="Unlimited"
                min="0"
              />
            </div>
          </div>
        </AdminCard>

        <!-- Active Dates -->
        <AdminCard title="Active Dates">
          <div class="grid grid-cols-2 gap-4">
            <div>
              <Label for="startsAt">Starts At</Label>
              <Input type="datetime-local" id="startsAt" name="startsAt" bind:value={startsAt} />
            </div>
            <div>
              <Label for="endsAt">Ends At</Label>
              <Input type="datetime-local" id="endsAt" name="endsAt" bind:value={endsAt} />
            </div>
          </div>
          <p class="mt-2 text-xs text-muted-foreground">
            Leave empty for no start/end date restrictions.
          </p>
        </AdminCard>
        <button
          type="button"
          class="text-sm text-red-600 hover:text-red-800 dark:text-red-700"
          onclick={() => (showDelete = true)}
        >
          Delete this promotion
        </button>
      </div>

      <!-- Right Sidebar -->
      <div class="w-full space-y-6 lg:w-80 lg:shrink-0">
        <!-- Status -->
        <AdminCard title="Status" variant="sidebar">
          <label class="flex items-center gap-2">
            <Checkbox bind:checked={enabled} />
            {#if enabled}
              <input type="hidden" name="enabled" value="on" />
            {/if}
            <span class="text-sm">Enabled</span>
          </label>
        </AdminCard>

        <!-- Combination Settings -->
        <AdminCard title="Combinations" variant="sidebar">
          <label class="flex items-center gap-2">
            <Checkbox bind:checked={combinesWithOtherPromotions} />
            {#if combinesWithOtherPromotions}
              <input type="hidden" name="combinesWithOtherPromotions" value="on" />
            {/if}
            <span class="text-sm">Combines with other promotions</span>
          </label>
          <p class="mt-2 text-xs text-muted-foreground">
            When enabled, this promotion can be used alongside other promotions on the same order.
          </p>
        </AdminCard>

        <!-- Customer Group -->
        <AdminCard title="Customer Group" variant="sidebar">
          <SelectNative name="customerGroupId" bind:value={customerGroupId}>
            <option value="">Not restricted</option>
            {#each data.customerGroups as group}
              <option value={group.id}>{group.name}</option>
            {/each}
          </SelectNative>
          <p class="mt-2 text-xs text-muted-foreground">
            Restrict this promotion to customers in a specific group.
          </p>
        </AdminCard>

        <!-- Usage Info -->
        <AdminCard title="Usage" variant="sidebar">
          <p class="text-sm text-foreground-tertiary">
            Used <span class="font-medium text-foreground">{promo.usageCount}</span>
            time{promo.usageCount !== 1 ? "s" : ""}
            {#if promo.usageLimit}
              out of {promo.usageLimit}
            {/if}
          </p>
        </AdminCard>
      </div>
    </div>
  </form>
</div>

<UnsavedChangesDialog isDirty={() => hasUnsavedChanges} />

<DeleteConfirmDialog
  bind:open={showDelete}
  title="Delete Promotion?"
  description="This will permanently delete the promotion code {promo.code}. This action cannot be undone."
/>
