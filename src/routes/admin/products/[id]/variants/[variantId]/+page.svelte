<script lang="ts">
  import { enhance } from "$app/forms";
  import { toast } from "svelte-sonner";
  import { Button } from "$lib/components/admin/ui/button";
  import { Input } from "$lib/components/admin/ui/input";
  import { Label } from "$lib/components/admin/ui/label";
  import { SelectNative } from "$lib/components/admin/ui/select-native";
  import DeleteConfirmDialog from "$lib/components/admin/DeleteConfirmDialog.svelte";
  import AdminCard from "$lib/components/admin/AdminCard.svelte";
  import ImagePicker from "$lib/components/admin/ImagePicker.svelte";
  import * as Popover from "$lib/components/admin/ui/popover";
  import * as Command from "$lib/components/admin/ui/command";
  import Check from "@lucide/svelte/icons/check";
  import ChevronsUpDown from "@lucide/svelte/icons/chevrons-up-down";
  import { Checkbox } from "$lib/components/admin/ui/checkbox";
  import { Badge } from "$lib/components/admin/ui/badge";
  import TranslationEditor from "$lib/components/admin/TranslationEditor.svelte";
  import { translationsToMap } from "$lib/config/languages.js";
  import X from "@lucide/svelte/icons/x";
  import Plus from "@lucide/svelte/icons/plus";
  import Trash2 from "@lucide/svelte/icons/trash-2";
  import ChevronLeft from "@lucide/svelte/icons/chevron-left";
  import UnsavedChangesDialog from "$lib/components/admin/UnsavedChangesDialog.svelte";
  import type { ActionData, PageData } from "./$types";

  let { data, form }: { data: PageData; form: ActionData } = $props();

  $effect(() => {
    if (form?.error) toast.error(form.error);
  });

  let isSubmitting = $state(false);
  let trackInventory = $state(data.variant.trackInventory);
  let showDelete = $state(false);
  let facetComboboxOpen = $state(false);
  let showImagePicker = $state(false);
  let variantName = $state("");
  let variantSku = $state("");
  let variantStock = $state(0);
  let variantPrice = $state(0);
  let imageUrl = $state<string | null>(null);

  // Facet value selections - initialize from current variant data
  let selectedFacetValues = $state<number[]>([]);

  $effect(() => {
    selectedFacetValues = data.variant.facetValues.map((fv) => fv.id);
    variantName = data.variant.name ?? "";
    variantSku = data.variant.sku;
    variantStock = data.variant.stock;
    variantPrice = data.variant.price / 100;
    imageUrl = data.variant.imageUrl ?? null;
  });

  // Flatten facet values for combobox display
  type FlatFacetValue = {
    id: number;
    name: string;
    facetName: string;
  };

  const flatFacetValues: FlatFacetValue[] = $derived(
    data.facets.flatMap((facet) =>
      facet.values.map((value) => ({
        id: value.id,
        name: value.name,
        facetName: facet.name
      }))
    )
  );

  function getSelectedFacetValueObjects() {
    return flatFacetValues.filter((fv) => selectedFacetValues.includes(fv.id));
  }

  function toggleFacetValue(id: number) {
    if (selectedFacetValues.includes(id)) {
      selectedFacetValues = selectedFacetValues.filter((fv) => fv !== id);
    } else {
      selectedFacetValues = [...selectedFacetValues, id];
    }
  }

  function removeFacetValue(id: number) {
    selectedFacetValues = selectedFacetValues.filter((fv) => fv !== id);
  }

  // Group pricing — all client-side, saved with main form
  let groupPricingEnabled = $state(data.groupPrices.length > 0);
  let groupPrices = $state<{ groupId: number; price: string }[]>(
    data.groupPrices.map((gp) => ({ groupId: gp.groupId, price: (gp.price / 100).toFixed(2) }))
  );
  let newGroupId = $state<number | null>(null);
  let newGroupPrice = $state("");

  const availableGroups = $derived(
    data.customerGroups.filter((g) => !groupPrices.some((gp) => gp.groupId === g.id))
  );

  function addGroupPrice() {
    const groupId = newGroupId ?? availableGroups[0]?.id;
    if (!groupId || !newGroupPrice) return;
    groupPrices = [...groupPrices, { groupId, price: newGroupPrice }];
    newGroupPrice = "";
    newGroupId = null;
  }

  function removeGroupPrice(groupId: number) {
    groupPrices = groupPrices.filter((gp) => gp.groupId !== groupId);
  }

  const originalGroupPricesJson = $derived(
    JSON.stringify(
      data.groupPrices.map((gp) => ({ groupId: gp.groupId, price: (gp.price / 100).toFixed(2) }))
    )
  );

  function handleImageSelected(
    files: {
      url: string;
      name: string;
      fileId: string;
      width: number;
      height: number;
      size: number;
      alt: string;
    }[]
  ) {
    if (files.length > 0) {
      imageUrl = files[0].url;
    }
  }

  const hasUnsavedChanges = $derived.by(() => {
    return (
      variantName !== (data.variant.name ?? "") ||
      variantSku !== data.variant.sku ||
      variantStock !== data.variant.stock ||
      variantPrice !== data.variant.price / 100 ||
      trackInventory !== data.variant.trackInventory ||
      imageUrl !== (data.variant.imageUrl ?? null) ||
      [...selectedFacetValues].sort().join() !==
        data.variant.facetValues
          .map((fv) => fv.id)
          .sort()
          .join() ||
      groupPricingEnabled !== data.groupPrices.length > 0 ||
      JSON.stringify(groupPrices) !== originalGroupPricesJson
    );
  });
</script>

<svelte:head>
  <title>Edit Variant {data.variant.sku} | {data.product.name} | Admin</title>
</svelte:head>

<div>
  <div class="mb-6">
    <div class="mb-4">
      <a
        href="/admin/products/{data.product.id}"
        class="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline dark:text-blue-400"
      >
        <ChevronLeft class="h-4 w-4" /> Back to {data.product.name}
      </a>
    </div>
    <div class="mt-2 flex items-center justify-between">
      <h1 class="text-2xl font-bold">Edit Variant</h1>
      <Button type="submit" form="variant-form" disabled={isSubmitting}>
        {isSubmitting ? "Saving..." : "Save Changes"}
      </Button>
    </div>
  </div>

  <!-- Two Column Layout -->
  <div class="flex flex-col gap-6 lg:flex-row">
    <!-- Main Content (Left) -->
    <div class="flex-1 space-y-6">
      <!-- Variant Details -->
      <form
        id="variant-form"
        method="POST"
        action="?/update"
        use:enhance={() => {
          isSubmitting = true;
          return async ({ result, update }) => {
            await update({ reset: false });
            isSubmitting = false;
            if (result.type === "success") {
              toast.success("Variant updated");
            }
          };
        }}
      >
        <input type="hidden" name="imageUrl" value={imageUrl ?? ""} />
        <AdminCard title="Variant Details">
          <div class="grid grid-cols-2 gap-4">
            <div>
              <Label for="variant_name">Name</Label>
              <Input type="text" id="variant_name" name="variant_name" bind:value={variantName} />
            </div>
            <div>
              <Label for="sku">SKU <span class="text-red-500">*</span></Label>
              <Input type="text" id="sku" name="sku" bind:value={variantSku} required />
            </div>
          </div>
        </AdminCard>
      </form>

      <!-- Price and Stock -->
      <AdminCard title="Stock and Price">
        <div class="space-y-4">
          <div class="grid grid-cols-2 gap-4">
            <div>
              <Label for="stock">Stock</Label>
              {#if trackInventory}
                <Input
                  type="number"
                  id="stock"
                  name="stock"
                  form="variant-form"
                  min="0"
                  bind:value={variantStock}
                />
              {:else}
                <Input
                  type="text"
                  id="stock"
                  disabled
                  placeholder="Unlimited"
                  class="bg-muted text-muted-foreground placeholder:text-muted-foreground"
                />
              {/if}
            </div>
            <div>
              <Label for="price">Price (EUR) <span class="text-red-500">*</span></Label>
              <Input
                type="number"
                id="price"
                name="price"
                form="variant-form"
                step="0.01"
                min="0"
                bind:value={variantPrice}
                required
              />
            </div>
          </div>
          <div class="flex items-center gap-2">
            <Checkbox id="trackInventory" bind:checked={trackInventory} />
            <label for="trackInventory" class="text-sm text-foreground-secondary">
              Track inventory
            </label>
          </div>
          {#if trackInventory}
            <input type="hidden" name="trackInventory" value="on" form="variant-form" />
          {/if}
        </div>
      </AdminCard>

      <!-- Group Pricing -->
      <AdminCard title="Group Pricing">
        <div class="space-y-4">
          <div class="flex items-center gap-2">
            <Checkbox id="groupPricingEnabled" bind:checked={groupPricingEnabled} />
            <label for="groupPricingEnabled" class="text-sm text-foreground-secondary">
              Enable customer group based pricing
            </label>
          </div>

          {#if groupPricingEnabled}
            {#if data.customerGroups.length === 0}
              <p class="text-sm text-muted-foreground">
                No customer groups exist.
                <a
                  href="/admin/customers/groups"
                  class="text-blue-600 hover:underline dark:text-blue-400"
                >
                  Create one
                </a>
                to set group-specific prices.
              </p>
            {:else}
              <div class="space-y-4">
                <!-- Column headers -->
                <div class="grid grid-cols-2 gap-4">
                  <span class="text-sm font-medium text-foreground-secondary">Group</span>
                  <span class="text-sm font-medium text-foreground-secondary">Price (EUR)</span>
                </div>

                <!-- Existing group prices -->
                {#each groupPrices as gp}
                  {@const group = data.customerGroups.find((g) => g.id === gp.groupId)}
                  <div class="grid grid-cols-2 gap-4">
                    <div
                      class="flex h-10 items-center rounded-lg border border-input-border bg-muted px-3 text-sm text-muted-foreground"
                    >
                      {group?.name ?? `Group #${gp.groupId}`}
                    </div>
                    <div class="flex gap-2">
                      <Input
                        id="group-price-{gp.groupId}"
                        type="number"
                        step="0.01"
                        min="0"
                        bind:value={gp.price}
                        class="h-10"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        class="h-10 w-10 shrink-0"
                        onclick={() => removeGroupPrice(gp.groupId)}
                      >
                        <Trash2 class="h-4 w-4 text-red-500" />
                      </Button>
                    </div>
                  </div>
                {/each}

                <!-- Add row -->
                {#if availableGroups.length > 0}
                  <div class="grid grid-cols-2 gap-4">
                    <SelectNative id="new-group-select" bind:value={newGroupId} class="h-10">
                      {#each availableGroups as group}
                        <option value={group.id}>{group.name}</option>
                      {/each}
                    </SelectNative>
                    <Input
                      id="new-group-price"
                      type="number"
                      step="0.01"
                      min="0"
                      bind:value={newGroupPrice}
                      placeholder="0.00"
                      class="h-10"
                    />
                  </div>
                  <div>
                    <Button type="button" variant="outline" size="sm" onclick={addGroupPrice}>
                      Add Price
                    </Button>
                  </div>
                {/if}
              </div>
            {/if}
          {/if}

          <!-- Hidden inputs for main form -->
          {#if groupPricingEnabled}
            <input form="variant-form" type="hidden" name="groupPricingEnabled" value="on" />
            {#each groupPrices as gp}
              <input
                form="variant-form"
                type="hidden"
                name="groupPriceGroupId"
                value={gp.groupId}
              />
              <input form="variant-form" type="hidden" name="groupPricePrice" value={gp.price} />
            {/each}
          {/if}
        </div>
      </AdminCard>
      <button
        type="button"
        class="text-sm text-red-600 hover:text-red-800 dark:text-red-700"
        onclick={() => (showDelete = true)}
      >
        Delete this variant
      </button>
    </div>

    <!-- Sidebar (Right) -->
    <div class="w-full space-y-6 lg:w-80 lg:shrink-0">
      <!-- Translations -->
      <TranslationEditor
        fields={[{ name: "name", label: "Name", type: "text" }]}
        translations={translationsToMap(data.translations)}
        formId="variant-form"
      />
      <!-- Image Section -->
      <AdminCard title="Image" variant="sidebar">
        {#snippet headerActions()}
          {#if !imageUrl}
            <Button
              type="button"
              size="sm"
              variant="outline"
              onclick={() => (showImagePicker = true)}
            >
              <Plus class="h-4 w-4" />
              Add
            </Button>
          {/if}
        {/snippet}
        {#if imageUrl}
          <div class="group relative">
            <img
              src="{imageUrl}?tr=w-400,h-400,fo-auto"
              alt={variantName || variantSku}
              class="h-48 w-full rounded border border-border object-cover"
            />
            <div
              class="absolute inset-0 flex items-center justify-center rounded bg-black/50 opacity-0 transition-opacity group-hover:opacity-100"
            >
              <Button
                type="button"
                size="sm"
                variant="destructive"
                class="h-7 w-7 p-0"
                onclick={() => (imageUrl = null)}
              >
                <Trash2 class="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        {:else}
          <p class="py-4 text-center text-sm text-muted-foreground">No image yet</p>
        {/if}
      </AdminCard>

      <!-- Facet Values Section -->
      <AdminCard title="Facet Values" variant="sidebar">
        {#if data.facets.length === 0}
          <p class="text-sm text-muted-foreground">No facets defined.</p>
        {:else}
          <!-- Combobox -->
          <Popover.Root bind:open={facetComboboxOpen}>
            <Popover.Trigger
              class="flex w-full items-center justify-between rounded-lg border border-input-border bg-surface px-3 py-2 text-sm hover:bg-hover"
              aria-expanded={facetComboboxOpen}
              aria-controls="facet-listbox"
              aria-haspopup="listbox"
            >
              <span class="text-muted-foreground">Select facet values...</span>
              <ChevronsUpDown class="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Popover.Trigger>
            <Popover.Content class="w-72 p-0" align="start">
              <Command.Root>
                <Command.Input placeholder="Search facet values..." />
                <Command.List id="facet-listbox" class="max-h-64">
                  <Command.Empty>No facet value found.</Command.Empty>
                  {#each data.facets as facet}
                    {#if facet.values.length > 0}
                      <Command.Group heading={facet.name}>
                        {#each facet.values as value}
                          <Command.Item
                            value="{facet.name} {value.name}"
                            onSelect={() => toggleFacetValue(value.id)}
                            class="cursor-pointer"
                          >
                            <div class="flex w-full items-center gap-2">
                              <div class="flex h-4 w-4 items-center justify-center">
                                {#if selectedFacetValues.includes(value.id)}
                                  <Check class="h-4 w-4" />
                                {/if}
                              </div>
                              <span>{value.name}</span>
                            </div>
                          </Command.Item>
                        {/each}
                      </Command.Group>
                    {/if}
                  {/each}
                </Command.List>
              </Command.Root>
            </Popover.Content>
          </Popover.Root>

          <!-- Selected facet values -->
          {#if selectedFacetValues.length > 0}
            <div class="mt-3 flex flex-wrap gap-1.5">
              {#each getSelectedFacetValueObjects() as fv}
                <Badge class="gap-1">
                  {fv.facetName}: {fv.name}
                  <button
                    type="button"
                    onclick={() => removeFacetValue(fv.id)}
                    class="ml-0.5 rounded-full p-0.5 hover:bg-blue-200 dark:hover:bg-blue-500/20"
                    aria-label="Remove {fv.name}"
                  >
                    <X class="h-3 w-3" />
                  </button>
                </Badge>
              {/each}
            </div>
          {/if}

          <!-- Hidden inputs to submit with the variant form -->
          {#each selectedFacetValues as fvId}
            <input form="variant-form" type="hidden" name="facetValueIds" value={fvId} />
          {/each}
        {/if}
      </AdminCard>

      <!-- Parent Product -->
      <AdminCard title="Parent Product" variant="sidebar">
        <a
          href="/admin/products/{data.product.id}"
          class="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline dark:text-blue-400"
        >
          {data.product.name}
        </a>
      </AdminCard>
    </div>
  </div>
</div>

<ImagePicker
  bind:open={showImagePicker}
  onClose={() => (showImagePicker = false)}
  onSelect={handleImageSelected}
/>

<UnsavedChangesDialog isDirty={() => hasUnsavedChanges} isSaving={() => isSubmitting} />

<DeleteConfirmDialog
  bind:open={showDelete}
  title="Delete Variant?"
  description="Are you sure you want to delete variant &quot;{data.variant
    .sku}&quot;? This action cannot be undone."
/>
