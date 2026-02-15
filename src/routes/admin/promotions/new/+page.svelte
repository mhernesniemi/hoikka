<script lang="ts">
  import { enhance } from "$app/forms";
  import { cn } from "$lib/utils";
  import { Button, buttonVariants } from "$lib/components/admin/ui/button";
  import { Checkbox } from "$lib/components/admin/ui/checkbox";
  import { Input } from "$lib/components/admin/ui/input";
  import { Label } from "$lib/components/admin/ui/label";
  import { SelectNative } from "$lib/components/admin/ui/select-native";
  import { Badge } from "$lib/components/admin/ui/badge";
  import * as Popover from "$lib/components/admin/ui/popover";
  import * as Command from "$lib/components/admin/ui/command";
  import AdminCard from "$lib/components/admin/AdminCard.svelte";
  import type { PageData, ActionData } from "./$types";
  import ShoppingCart from "@lucide/svelte/icons/shopping-cart";
  import Tag from "@lucide/svelte/icons/tag";
  import Truck from "@lucide/svelte/icons/truck";
  import ChevronsUpDown from "@lucide/svelte/icons/chevrons-up-down";
  import Check from "@lucide/svelte/icons/check";
  import X from "@lucide/svelte/icons/x";
  import ChevronLeft from "@lucide/svelte/icons/chevron-left";
  import { toast } from "svelte-sonner";
  import UnsavedChangesDialog from "$lib/components/admin/UnsavedChangesDialog.svelte";

  let { data, form }: { data: PageData; form: ActionData } = $props();

  $effect(() => {
    if (form?.error) toast.error(form.error);
  });

  let isSubmitting = $state(false);
  let code = $state("");
  let title = $state("");
  let discountValue = $state<number | string>("");
  let minOrderAmount = $state<number | string>("");
  let usageLimit = $state<number | string>("");
  let usageLimitPerCustomer = $state<number | string>("");
  let startsAt = $state("");
  let endsAt = $state("");

  let method = $state<"code" | "automatic">("automatic");
  let promotionType = $state<"order" | "product" | "free_shipping">("order");
  let discountType = $state<"percentage" | "fixed_amount">("percentage");
  let appliesTo = $state<"all" | "specific_products" | "specific_collections">("all");
  let selectedProductIds = $state<number[]>([]);
  let selectedCollectionIds = $state<number[]>([]);
  let productComboboxOpen = $state(false);
  let collectionComboboxOpen = $state(false);
  let combinesWithOtherPromotions = $state(false);

  const hasUnsavedChanges = $derived(
    code !== "" ||
      title !== "" ||
      discountValue !== "" ||
      selectedProductIds.length > 0 ||
      selectedCollectionIds.length > 0 ||
      minOrderAmount !== "" ||
      usageLimit !== "" ||
      usageLimitPerCustomer !== "" ||
      startsAt !== "" ||
      endsAt !== "" ||
      combinesWithOtherPromotions
  );

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

  const typeOptions = [
    { value: "order" as const, label: "Amount off order", icon: ShoppingCart },
    { value: "product" as const, label: "Amount off products", icon: Tag },
    { value: "free_shipping" as const, label: "Free shipping", icon: Truck }
  ];

  const typeLabels: Record<string, string> = {
    order: "Amount off order",
    product: "Amount off products",
    free_shipping: "Free shipping"
  };
</script>

<svelte:head><title>Create Promotion | Admin</title></svelte:head>

<div class="space-y-6">
  <div class="mb-6 flex items-center justify-between">
    <a
      href="/admin/promotions"
      class="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline dark:text-blue-400"
      ><ChevronLeft class="h-4 w-4" /> Back to Promotions</a
    >
  </div>
  <div class="flex items-center justify-between">
    <h1 class="text-2xl font-bold">Create Promotion</h1>
    <div class="flex items-center gap-3">
      <a href="/admin/promotions" class={buttonVariants({ variant: "outline" })}>Cancel</a>
      <Button type="submit" form="create-form" disabled={isSubmitting}>
        {isSubmitting ? "Creating..." : "Create Promotion"}
      </Button>
    </div>
  </div>

  <form
    method="POST"
    use:enhance={() => {
      isSubmitting = true;
      return async ({ update }) => {
        await update({ reset: false });
        isSubmitting = false;
      };
    }}
    id="create-form"
  >
    <input type="hidden" name="productIds" value={JSON.stringify(selectedProductIds)} />
    <input type="hidden" name="collectionIds" value={JSON.stringify(selectedCollectionIds)} />

    <div class="flex flex-col gap-6 lg:flex-row">
      <!-- Left Column -->
      <div class="flex-1 space-y-6">
        <!-- Type Selection -->
        <AdminCard title="Promotion Type">
          <div class="grid grid-cols-3 gap-3">
            {#each typeOptions as option}
              <label
                class={cn(
                  "flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 p-4 text-center transition-colors",
                  promotionType === option.value
                    ? "border-blue-500 bg-accent-subtle"
                    : "border-border hover:border-input-border"
                )}
              >
                <input
                  type="radio"
                  name="promotionType"
                  value={option.value}
                  bind:group={promotionType}
                  class="sr-only"
                />
                <option.icon
                  class={cn(
                    "h-6 w-6",
                    promotionType === option.value
                      ? "text-blue-600 dark:text-blue-400"
                      : "text-placeholder"
                  )}
                />
                <span class="text-sm font-medium">{option.label}</span>
              </label>
            {/each}
          </div>
        </AdminCard>

        <!-- Method + Code/Title -->
        <AdminCard title="Discount Method">
          <input type="hidden" name="method" value={method} />
          <div class="mb-4 inline-flex rounded-lg border border-border p-0.5">
            <button
              type="button"
              class={cn(
                "rounded-md px-4 py-1.5 text-sm font-medium transition-colors",
                method === "automatic"
                  ? "bg-gray-900 text-white"
                  : "text-foreground-tertiary hover:text-foreground"
              )}
              onclick={() => (method = "automatic")}
            >
              Automatic discount
            </button>
            <button
              type="button"
              class={cn(
                "rounded-md px-4 py-1.5 text-sm font-medium transition-colors",
                method === "code"
                  ? "bg-gray-900 text-white"
                  : "text-foreground-tertiary hover:text-foreground"
              )}
              onclick={() => (method = "code")}
            >
              Discount code
            </button>
          </div>

          {#if method === "code"}
            <div>
              <Label for="code">Code</Label>
              <Input
                type="text"
                id="code"
                name="code"
                bind:value={code}
                placeholder="e.g., SUMMER20"
                required
                class="uppercase"
              />
              <p class="mt-1 text-xs text-muted-foreground">
                Customers will enter this code at checkout.
              </p>
            </div>
          {:else}
            <div>
              <Label for="title">Title</Label>
              <Input
                type="text"
                id="title"
                name="title"
                bind:value={title}
                placeholder="e.g., Summer Sale 20% Off"
                required
              />
              <p class="mt-1 text-xs text-muted-foreground">
                Customers will see this in their cart and at checkout.
              </p>
            </div>
          {/if}
        </AdminCard>

        <!-- Discount (hidden for free_shipping) -->
        {#if promotionType !== "free_shipping"}
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
                <Label for="discountValue">Value</Label>
                <Input
                  type="number"
                  id="discountValue"
                  name="discountValue"
                  bind:value={discountValue}
                  placeholder={discountType === "percentage" ? "e.g., 20" : "e.g., 10.00"}
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
        {#if promotionType === "product"}
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
                    class="flex h-9 items-center justify-between rounded-lg border border-input-border bg-surface px-3 py-2 text-sm hover:bg-hover"
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
                  <div class="mt-4 flex flex-wrap gap-1">
                    {#each selectedProductIds as id}
                      <Badge variant="secondary" class="gap-1 text-sm">
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
                    class="flex h-9 items-center justify-between rounded-lg border border-input-border bg-surface px-3 py-2 text-sm hover:bg-hover"
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
                  <div class="mt-4 flex flex-wrap gap-1">
                    {#each selectedCollectionIds as id}
                      <Badge variant="secondary" class="gap-1 text-sm">
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
      </div>

      <!-- Right Sidebar -->
      <div class="w-full space-y-6 lg:w-80 lg:shrink-0">
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
          <SelectNative name="customerGroupId">
            <option value="">Not restricted</option>
            {#each data.customerGroups as group}
              <option value={group.id}>{group.name}</option>
            {/each}
          </SelectNative>
          <p class="mt-2 text-xs text-muted-foreground">
            Restrict this promotion to customers in a specific group.
          </p>
        </AdminCard>

        <!-- Summary -->
        <AdminCard title="Summary" variant="sidebar">
          <div class="space-y-2 text-sm text-foreground-tertiary">
            <p>
              <span class="font-medium text-foreground">Method:</span>
              <Badge variant="outline">{method === "code" ? "Discount code" : "Automatic"}</Badge>
            </p>
            <p>
              <span class="font-medium text-foreground">Type:</span>
              <Badge variant="outline">{typeLabels[promotionType]}</Badge>
            </p>
            {#if promotionType !== "free_shipping"}
              <p>
                <span class="font-medium text-foreground">Discount:</span>
                {discountType === "percentage" ? "Percentage off" : "Fixed amount off"}
              </p>
            {/if}
            {#if promotionType === "product"}
              <p>
                <span class="font-medium text-foreground">Applies to:</span>
                {appliesTo === "all"
                  ? "All products"
                  : appliesTo === "specific_products"
                    ? `${selectedProductIds.length} product(s)`
                    : `${selectedCollectionIds.length} collection(s)`}
              </p>
            {/if}
          </div>
        </AdminCard>
      </div>
    </div>
  </form>
</div>

<UnsavedChangesDialog isDirty={() => hasUnsavedChanges} isSaving={() => isSubmitting} />
