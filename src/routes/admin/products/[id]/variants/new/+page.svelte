<script lang="ts">
  import { enhance } from "$app/forms";
  import { toast } from "svelte-sonner";
  import { Button, buttonVariants } from "$lib/components/admin/ui/button";
  import { Input } from "$lib/components/admin/ui/input";
  import { Label } from "$lib/components/admin/ui/label";
  import UnsavedChangesDialog from "$lib/components/admin/UnsavedChangesDialog.svelte";
  import * as Popover from "$lib/components/admin/ui/popover";
  import * as Command from "$lib/components/admin/ui/command";
  import Check from "@lucide/svelte/icons/check";
  import ChevronsUpDown from "@lucide/svelte/icons/chevrons-up-down";
  import { Checkbox } from "$lib/components/admin/ui/checkbox";
  import { Badge } from "$lib/components/admin/ui/badge";
  import X from "@lucide/svelte/icons/x";
  import ChevronLeft from "@lucide/svelte/icons/chevron-left";
  import ChevronRight from "@lucide/svelte/icons/chevron-right";
  import type { ActionData, PageData } from "./$types";

  let { data, form }: { data: PageData; form: ActionData } = $props();

  $effect(() => {
    if (form?.error) toast.error(form.error);
  });

  let isSubmitting = $state(false);
  let trackInventory = $state(false);
  let facetComboboxOpen = $state(false);
  let variantName = $state("");
  let variantSku = $state("");
  let variantPrice = $state<number | string>("");
  let variantStock = $state<number | string>(0);

  // Facet value selections
  let selectedFacetValues = $state<number[]>([]);

  const hasUnsavedChanges = $derived(
    variantName !== "" || variantSku !== "" || variantPrice !== "" || selectedFacetValues.length > 0
  );

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
</script>

<svelte:head><title>Add Variant | {data.product.name} | Admin</title></svelte:head>

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
      <h1 class="text-2xl font-bold">Add Variant</h1>
      <div class="flex items-center gap-3">
        <a href="/admin/products/{data.product.id}" class={buttonVariants({ variant: "outline" })}>
          Cancel
        </a>
        <Button type="submit" form="variant-form" disabled={isSubmitting}>
          {isSubmitting ? "Creating..." : "Add Variant"}
        </Button>
      </div>
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
        use:enhance={() => {
          isSubmitting = true;
          return async ({ update }) => {
            await update({ reset: false });
            isSubmitting = false;
          };
        }}
        class="rounded-lg bg-surface shadow"
      >
        <div class="space-y-4 p-6">
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
        </div>
      </form>

      <!-- Price and Stock -->
      <div class="rounded-lg bg-surface shadow">
        <div class="space-y-4 p-6">
          <h2 class="text-lg font-semibold">Price and stock</h2>
          <div class="grid grid-cols-2 gap-4">
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
                  value="Unlimited"
                  class="bg-muted text-muted-foreground"
                />
              {/if}
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
      </div>
    </div>

    <!-- Sidebar (Right) -->
    <div class="w-full space-y-6 lg:w-80 lg:shrink-0">
      <!-- Facet Values Section -->
      <div class="rounded-lg bg-surface shadow">
        <div class="border-b border-border px-4 py-3">
          <h2 class="font-semibold">Facet Values</h2>
        </div>

        <div class="p-4">
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
        </div>
      </div>

      <!-- Parent Product -->
      <div class="rounded-lg bg-surface shadow">
        <div class="border-b border-border px-4 py-3">
          <h2 class="font-semibold">Parent Product</h2>
        </div>
        <div class="p-4">
          <a
            href="/admin/products/{data.product.id}"
            class="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline dark:text-blue-400"
          >
            {data.product.name}
            <ChevronRight class="h-4 w-4" />
          </a>
        </div>
      </div>
    </div>
  </div>
</div>

<UnsavedChangesDialog isDirty={() => hasUnsavedChanges} isSaving={() => isSubmitting} />
