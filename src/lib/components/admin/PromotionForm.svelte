<script lang="ts" module>
  export const typeLabels: Record<string, string> = {
    order: "Amount off order",
    product: "Amount off products",
    free_shipping: "Free shipping"
  };
</script>

<script lang="ts">
  import { BASE_CURRENCY } from "$lib/utils";
  import type { Snippet } from "svelte";
  import { Checkbox } from "$lib/components/admin/ui/checkbox";
  import { Input } from "$lib/components/admin/ui/input";
  import { Label } from "$lib/components/admin/ui/label";
  import { SelectNative } from "$lib/components/admin/ui/select-native";
  import AdminCard from "$lib/components/admin/AdminCard.svelte";
  import MultiSelectCombobox from "$lib/components/admin/MultiSelectCombobox.svelte";

  type Item = { id: number; name: string };

  let {
    products,
    collections,
    customerGroups,
    promotionType,
    discountValuePlaceholder,
    discountType = $bindable(),
    discountValue = $bindable(),
    appliesTo = $bindable(),
    selectedProductIds = $bindable(),
    selectedCollectionIds = $bindable(),
    minOrderAmount = $bindable(),
    usageLimit = $bindable(),
    usageLimitPerCustomer = $bindable(),
    startsAt = $bindable(),
    endsAt = $bindable(),
    combinesWithOtherPromotions = $bindable(),
    customerGroupId = $bindable(""),
    main,
    mainFooter,
    sidebarTop,
    sidebarBottom
  }: {
    products: Item[];
    collections: Item[];
    customerGroups: Item[];
    promotionType: "order" | "product" | "free_shipping";
    /** Placeholder for the discount value input (omitted on the edit page) */
    discountValuePlaceholder?: string;
    discountType: "percentage" | "fixed_amount";
    discountValue: number | string;
    appliesTo: "all" | "specific_products" | "specific_collections";
    selectedProductIds: number[];
    selectedCollectionIds: number[];
    minOrderAmount: number | string;
    usageLimit: number | string;
    usageLimitPerCustomer: number | string;
    startsAt: string;
    endsAt: string;
    combinesWithOtherPromotions: boolean;
    customerGroupId?: string;
    /** Page-specific cards at the top of the left column (method/code/title) */
    main?: Snippet;
    /** Page-specific content below the left-column cards (e.g. delete button) */
    mainFooter?: Snippet;
    /** Page-specific cards above the shared sidebar cards (e.g. status) */
    sidebarTop?: Snippet;
    /** Page-specific cards below the shared sidebar cards (e.g. summary, usage) */
    sidebarBottom?: Snippet;
  } = $props();

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

  // Include selected ids that are missing from the loaded lists (the product
  // list is capped) so their badges still render and can be removed.
  const productItems = $derived([
    ...products.map((p) => ({ id: p.id, label: p.name })),
    ...selectedProductIds
      .filter((id) => !products.some((p) => p.id === id))
      .map((id) => ({ id, label: `Product #${id}` }))
  ]);

  const collectionItems = $derived([
    ...collections.map((c) => ({ id: c.id, label: c.name })),
    ...selectedCollectionIds
      .filter((id) => !collections.some((c) => c.id === id))
      .map((id) => ({ id, label: `Collection #${id}` }))
  ]);
</script>

<input type="hidden" name="productIds" value={JSON.stringify(selectedProductIds)} />
<input type="hidden" name="collectionIds" value={JSON.stringify(selectedCollectionIds)} />

<div class="flex flex-col gap-6 lg:flex-row">
  <!-- Left Column -->
  <div class="flex-1 space-y-6">
    {@render main?.()}

    <!-- Discount (hidden for free_shipping) -->
    {#if promotionType !== "free_shipping"}
      <AdminCard title="Discount Value">
        <div class="grid grid-cols-2 gap-4">
          <div>
            <Label for="discountType">Discount Type</Label>
            <SelectNative id="discountType" name="discountType" bind:value={discountType}>
              <option value="percentage">Percentage (%)</option>
              <option value="fixed_amount">Fixed Amount ({BASE_CURRENCY})</option>
            </SelectNative>
          </div>
          <div>
            <Label for="discountValue">Value <span class="text-red-500">*</span></Label>
            <Input
              type="number"
              id="discountValue"
              name="discountValue"
              bind:value={discountValue}
              placeholder={discountValuePlaceholder}
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
            <MultiSelectCombobox
              items={productItems}
              selected={selectedProductIds}
              onToggle={toggleProduct}
              placeholder="Search products..."
              searchPlaceholder="Search products..."
              emptyText="No products found."
              showCount
            />
          </div>
        {/if}

        {#if appliesTo === "specific_collections"}
          <div class="mt-4">
            <p class="mb-2 text-sm font-medium text-foreground-secondary">Select Collections</p>
            <MultiSelectCombobox
              items={collectionItems}
              selected={selectedCollectionIds}
              onToggle={toggleCollection}
              placeholder="Search collections..."
              searchPlaceholder="Search collections..."
              emptyText="No collections found."
              showCount
            />
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
          <Label for="minOrderAmount">Min Order ({BASE_CURRENCY})</Label>
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

    {@render mainFooter?.()}
  </div>

  <!-- Right Sidebar -->
  <div class="w-full space-y-6 lg:w-80 lg:shrink-0">
    {@render sidebarTop?.()}

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
        {#each customerGroups as group}
          <option value={group.id}>{group.name}</option>
        {/each}
      </SelectNative>
      <p class="mt-2 text-xs text-muted-foreground">
        Restrict this promotion to customers in a specific group.
      </p>
    </AdminCard>

    {@render sidebarBottom?.()}
  </div>
</div>
