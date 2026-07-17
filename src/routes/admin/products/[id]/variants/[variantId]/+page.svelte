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
  import * as Dialog from "$lib/components/admin/ui/dialog";
  import { Checkbox } from "$lib/components/admin/ui/checkbox";
  import IconButton from "$lib/components/admin/IconButton.svelte";
  import MultiSelectCombobox from "$lib/components/admin/MultiSelectCombobox.svelte";
  import TranslationEditor from "$lib/components/admin/TranslationEditor.svelte";
  import { translationsToMap } from "$lib/config/languages.js";
  import Plus from "@lucide/svelte/icons/plus";
  import Trash2 from "@lucide/svelte/icons/trash-2";
  import ChevronLeft from "@lucide/svelte/icons/chevron-left";
  import UnsavedChangesDialog from "$lib/components/admin/UnsavedChangesDialog.svelte";
  import { imageUrl as imgUrl } from "$lib/image";
  import type { ActionData, PageData } from "./$types";

  let { data, form }: { data: PageData; form: ActionData } = $props();

  $effect(() => {
    if (form?.error) toast.error(form.error);
  });

  let isSubmitting = $state(false);
  let trackInventory = $state(data.variant.trackInventory);
  let showDelete = $state(false);
  let showImagePicker = $state(false);
  let variantName = $state("");
  let variantSku = $state("");
  let variantStock = $state(0);
  let variantPrice = $state(0);
  let imageUrl = $state<string | null>(null);
  let isFeatured = $state(false);

  // Facet value selections - initialize from current variant data
  let selectedFacetValues = $state<number[]>([]);

  $effect(() => {
    selectedFacetValues = data.variant.facetValues.map((fv) => fv.id);
    variantName = data.variant.name ?? "";
    variantSku = data.variant.sku;
    variantStock = data.variant.stock;
    variantPrice = data.variant.price / 100;
    trackInventory = data.variant.trackInventory;
    imageUrl = data.variant.imageUrl ?? null;
    isFeatured = data.variant.isFeatured;
    groupPrices = data.groupPrices.map((gp) => ({
      groupId: gp.groupId,
      price: (gp.price / 100).toFixed(2)
    }));
  });

  // Flatten facet values for combobox display
  const facetItems = $derived(
    data.facets.flatMap((facet) =>
      facet.values.map((value) => ({
        id: value.id,
        label: value.name,
        group: facet.name,
        badgeLabel: `${facet.name}: ${value.name}`
      }))
    )
  );

  function toggleFacetValue(id: number) {
    if (selectedFacetValues.includes(id)) {
      selectedFacetValues = selectedFacetValues.filter((fv) => fv !== id);
    } else {
      selectedFacetValues = [...selectedFacetValues, id];
    }
  }

  // Group pricing — all client-side, saved with main form
  let groupPrices = $state<{ groupId: number; price: string }[]>(
    data.groupPrices.map((gp) => ({ groupId: gp.groupId, price: (gp.price / 100).toFixed(2) }))
  );
  let showAddGroupPrice = $state(false);
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
    showAddGroupPrice = false;
  }

  function removeGroupPrice(groupId: number) {
    groupPrices = groupPrices.filter((gp) => gp.groupId !== groupId);
  }

  const originalGroupPricesJson = $derived(
    JSON.stringify(
      data.groupPrices.map((gp) => ({ groupId: gp.groupId, price: (gp.price / 100).toFixed(2) }))
    )
  );

  let imageMeta = $state<{ name: string; width: number; height: number; size: number } | null>(
    null
  );

  function handleImageSelected(
    files: {
      url: string;
      name: string;
      width: number;
      height: number;
      size: number;
      alt: string;
    }[]
  ) {
    if (files.length > 0) {
      imageUrl = files[0].url;
      imageMeta = {
        name: files[0].name,
        width: files[0].width,
        height: files[0].height,
        size: files[0].size
      };
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
      isFeatured !== data.variant.isFeatured ||
      [...selectedFacetValues].sort().join() !==
        data.variant.facetValues
          .map((fv) => fv.id)
          .sort()
          .join() ||
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
        {#if imageMeta}
          <input type="hidden" name="imageName" value={imageMeta.name} />
          <input type="hidden" name="imageWidth" value={imageMeta.width} />
          <input type="hidden" name="imageHeight" value={imageMeta.height} />
          <input type="hidden" name="imageSize" value={imageMeta.size} />
        {/if}
        {#if isFeatured}
          <input type="hidden" name="isFeatured" value="on" />
        {/if}
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
      <AdminCard title="Customer Group Pricing">
        {#snippet headerActions()}
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={availableGroups.length === 0}
            onclick={() => (showAddGroupPrice = true)}
          >
            <Plus class="h-4 w-4" /> Add
          </Button>
        {/snippet}
        {#if data.customerGroups.length === 0}
          <p class="text-sm text-muted-foreground">
            No customer groups exist.
            <a
              href="/admin/customers?tab=groups"
              class="text-blue-600 hover:underline dark:text-blue-400"
            >
              Create one
            </a>
            to set group-specific prices.
          </p>
        {:else if groupPrices.length > 0}
          <div class="flex flex-col gap-4">
            <!-- Column headers -->
            <div class="grid grid-cols-2 gap-4">
              <span class="text-sm font-medium text-foreground-secondary">Group</span>
              <span class="text-sm font-medium text-foreground-secondary">Price (EUR)</span>
            </div>

            {#each groupPrices as gp}
              {@const group = data.customerGroups.find((g) => g.id === gp.groupId)}
              <div class="grid grid-cols-2 gap-4">
                <div
                  class="flex h-10 items-center rounded-lg border border-input-border bg-muted px-3 text-sm text-muted-foreground"
                >
                  {group?.name ?? `Group #${gp.groupId}`}
                </div>
                <div class="flex items-center gap-2">
                  <Input
                    id="group-price-{gp.groupId}"
                    type="number"
                    step="0.01"
                    min="0"
                    bind:value={gp.price}
                    class="h-10"
                  />
                  <IconButton
                    icon={Trash2}
                    tooltip="Remove group price"
                    variant="danger"
                    onclick={() => removeGroupPrice(gp.groupId)}
                  />
                </div>
              </div>
            {/each}
          </div>
        {:else}
          <p class="text-sm text-muted-foreground">No group prices set.</p>
        {/if}

        <!-- Hidden inputs for main form -->
        {#if groupPrices.length > 0}
          <input form="variant-form" type="hidden" name="groupPricingEnabled" value="on" />
          {#each groupPrices as gp}
            <input form="variant-form" type="hidden" name="groupPriceGroupId" value={gp.groupId} />
            <input form="variant-form" type="hidden" name="groupPricePrice" value={gp.price} />
          {/each}
        {/if}
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
      <!-- Featured Variant -->
      <AdminCard title="Featured Variant" variant="sidebar">
        <div class="flex items-center gap-2">
          <Checkbox id="isFeatured" bind:checked={isFeatured} />
          <label for="isFeatured" class="text-sm text-foreground-secondary">
            Featured variant
          </label>
        </div>
        <p class="mt-2 text-xs text-muted-foreground">
          Featured variant image is used as the product display image when the product has no image.
        </p>
      </AdminCard>

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
              src={imgUrl(imageUrl, 400)}
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
          <MultiSelectCombobox
            items={facetItems}
            selected={selectedFacetValues}
            onToggle={toggleFacetValue}
            placeholder="Select facet values..."
            searchPlaceholder="Search facet values..."
            emptyText="No facet value found."
            form="variant-form"
            name="facetValueIds"
          />
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

<Dialog.Root
  bind:open={showAddGroupPrice}
  onOpenChange={(open) => {
    if (!open) {
      newGroupId = null;
      newGroupPrice = "";
    }
  }}
>
  <Dialog.Content>
    <Dialog.Header>
      <Dialog.Title>Add Group Price</Dialog.Title>
      <Dialog.Description>Set a price for a specific customer group.</Dialog.Description>
    </Dialog.Header>
    <div class="my-4 space-y-4">
      <div>
        <Label for="dialog-group-select">Customer Group</Label>
        <SelectNative id="dialog-group-select" bind:value={newGroupId}>
          {#each availableGroups as group}
            <option value={group.id}>{group.name}</option>
          {/each}
        </SelectNative>
      </div>
      <div>
        <Label for="dialog-group-price">Price (EUR)</Label>
        <Input
          id="dialog-group-price"
          type="number"
          step="0.01"
          min="0"
          bind:value={newGroupPrice}
          placeholder="0.00"
          onkeydown={(e: KeyboardEvent) => {
            if (e.key === "Enter" && newGroupPrice) {
              e.preventDefault();
              addGroupPrice();
            }
          }}
        />
      </div>
    </div>
    <Dialog.Footer>
      <Button type="button" variant="outline" onclick={() => (showAddGroupPrice = false)}
        >Cancel</Button
      >
      <Button type="button" disabled={!newGroupPrice} onclick={addGroupPrice}>Save</Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>

<DeleteConfirmDialog
  bind:open={showDelete}
  title="Delete Variant?"
  description="Are you sure you want to delete variant &quot;{data.variant
    .sku}&quot;? This action cannot be undone."
/>
