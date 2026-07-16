<script lang="ts">
  import { deserialize, enhance } from "$app/forms";
  import { invalidateAll } from "$app/navigation";
  import { page } from "$app/state";
  import { onMount } from "svelte";
  import { toast } from "svelte-sonner";
  import type { ColumnDef } from "@tanstack/table-core";
  import { DataTable, renderSnippet } from "$lib/components/admin/data-table";
  import { Button } from "$lib/components/admin/ui/button";
  import { Badge } from "$lib/components/admin/ui/badge";
  import { Checkbox } from "$lib/components/admin/ui/checkbox";
  import { Input } from "$lib/components/admin/ui/input";
  import { Label } from "$lib/components/admin/ui/label";
  import { SelectNative } from "$lib/components/admin/ui/select-native";
  import { RichTextEditor } from "$lib/components/admin/ui/rich-text-editor";
  import AdminCard from "$lib/components/admin/AdminCard.svelte";
  import DeleteConfirmDialog from "$lib/components/admin/DeleteConfirmDialog.svelte";
  import CreateDialog from "$lib/components/admin/CreateDialog.svelte";
  import ImagePicker from "$lib/components/admin/ImagePicker.svelte";
  import {
    translationsToMap,
    LANGUAGES,
    DEFAULT_LANGUAGE,
    TRANSLATION_LANGUAGES
  } from "$lib/config/languages.js";
  import { cn, BASE_CURRENCY } from "$lib/utils";
  import { imageUrl } from "$lib/image";
  import UnsavedChangesDialog from "$lib/components/admin/UnsavedChangesDialog.svelte";
  import * as Dialog from "$lib/components/admin/ui/dialog";
  import * as Popover from "$lib/components/admin/ui/popover";
  import * as Command from "$lib/components/admin/ui/command";
  import * as DropdownMenu from "$lib/components/admin/ui/dropdown-menu";
  import X from "@lucide/svelte/icons/x";

  import ChevronLeft from "@lucide/svelte/icons/chevron-left";
  import ExternalLink from "@lucide/svelte/icons/external-link";
  import ChevronsUpDown from "@lucide/svelte/icons/chevrons-up-down";
  import Check from "@lucide/svelte/icons/check";
  import Package from "@lucide/svelte/icons/package";
  import Plus from "@lucide/svelte/icons/plus";
  import Pencil from "@lucide/svelte/icons/pencil";
  import Trash2 from "@lucide/svelte/icons/trash-2";
  let { data, form } = $props();

  let cameFromCreate = $state(false);
  let showCancelDelete = $state(false);
  let hasSaved = $state(false);
  let createDialogOpen = $state(false);

  onMount(() => {
    if (page.url.searchParams.has("created")) {
      cameFromCreate = true;
      showCancelDelete = true;
      history.replaceState({}, "", page.url.pathname);
    }
  });

  $effect(() => {
    if (form?.error) toast.error(form.error);
  });

  let isSubmitting = $state(false);
  let showDelete = $state(false);
  let activeLanguageTab = $state(DEFAULT_LANGUAGE);
  const translationMap = $derived(translationsToMap(data.translations));
  let showImagePicker = $state(false);
  let isSavingImages = $state(false);
  let editingImageAlt = $state<{ id: number; alt: string } | null>(null);

  // ── Form state ────────────────────────────────────────────────────────
  let name = $state(data.collection.name ?? "");
  let slug = $state(data.collection.slug ?? "");
  let description = $state(data.collection.description ?? "");
  let isPrivate = $state(data.collection.isPrivate);

  type LocalFilter = { key: number; field: string; operator: string; value: unknown };
  type PreviewProduct = (typeof data.preview)[0];
  let filterKey = 0;
  let localFilters = $state<LocalFilter[]>(
    data.collection.filters.map((f) => ({
      key: filterKey++,
      field: f.field,
      operator: f.operator,
      value: structuredClone(f.value)
    }))
  );

  // Serialized filters for the hidden form input
  const filtersJson = $derived(
    JSON.stringify(
      localFilters.map((f) => ({ field: f.field, operator: f.operator, value: f.value }))
    )
  );

  // Unsaved changes detection
  const hasUnsavedChanges = $derived.by(() => {
    const savedName = data.collection.name ?? "";
    const savedSlug = data.collection.slug ?? "";
    const savedDescription = data.collection.description ?? "";
    const savedIsPrivate = data.collection.isPrivate;
    const savedFilters = JSON.stringify(
      data.collection.filters.map((f) => ({ field: f.field, operator: f.operator, value: f.value }))
    );

    return (
      name !== savedName ||
      slug !== savedSlug ||
      description !== savedDescription ||
      isPrivate !== savedIsPrivate ||
      filtersJson !== savedFilters
    );
  });

  // Live preview — debounce-fetch matching products when filters change
  let previewProducts = $state<PreviewProduct[] | null>(null);
  let previewCount = $state<number | null>(null);

  $effect(() => {
    const current = filtersJson;

    const formData = new FormData();
    formData.set("filters", current);

    let cancelled = false;

    fetch("?/preview", { method: "POST", body: formData })
      .then((response) => response.text())
      .then((text) => {
        if (cancelled) return;
        const result = deserialize(text);
        if (result.type === "success" && result.data) {
          previewProducts = result.data.preview as PreviewProduct[];
          previewCount = result.data.productCount as number;
        }
      });

    return () => {
      cancelled = true;
    };
  });

  // ── Image handling ────────────────────────────────────────────────────
  async function handleImagesSelected(
    files: {
      url: string;
      name: string;
      width: number;
      height: number;
      size: number;
      alt: string;
    }[]
  ) {
    isSavingImages = true;

    try {
      for (const file of files) {
        const saveForm = new FormData();
        saveForm.append("url", file.url);
        saveForm.append("name", file.name);
        saveForm.append("width", file.width.toString());
        saveForm.append("height", file.height.toString());
        saveForm.append("fileSize", file.size.toString());
        saveForm.append("alt", file.alt);

        await fetch(`?/addImage`, {
          method: "POST",
          body: saveForm
        });
      }

      await invalidateAll();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save images");
    } finally {
      isSavingImages = false;
    }
  }

  // ── Filter helpers ───────────────────────────────────────────────────
  let openPopover = $state<number | null>(null);
  let addFilterOpen = $state(false);

  const filterTypes = [
    { field: "facet", operator: "in", label: "Facet Values" },
    { field: "product", operator: "in", label: "Products" },
    { field: "price", operator: "gte", label: "Price" },
    { field: "stock", operator: "gt", label: "Stock" },
    { field: "visibility", operator: "eq", label: "Visibility" }
  ] as const;

  const defaultValues: Record<string, unknown> = {
    facet: [],
    product: [],
    price: 0,
    stock: 0,
    visibility: "public"
  };

  function getFieldLabel(field: string): string {
    const labels: Record<string, string> = {
      facet: "Facet Values",
      visibility: "Visibility",
      price: "Price",
      stock: "Stock",
      product: "Products",
      variant: "Variants"
    };
    return labels[field] ?? field;
  }

  function addFilter(field: string, operator: string) {
    const key = filterKey++;
    localFilters = [
      ...localFilters,
      { key, field, operator, value: structuredClone(defaultValues[field] ?? "") }
    ];
    if (field === "facet" || field === "product") {
      // Wait a tick for the DOM to render, then open the popover
      requestAnimationFrame(() => {
        openPopover = key;
      });
    }
  }

  function removeFilter(index: number) {
    openPopover = null;
    localFilters = localFilters.filter((_, i) => i !== index);
  }

  function toggleArrayValue(index: number, toggleId: number) {
    const filter = localFilters[index];
    const arr = Array.isArray(filter.value) ? (filter.value as number[]) : [];
    localFilters[index] = {
      ...filter,
      value: arr.includes(toggleId) ? arr.filter((id) => id !== toggleId) : [...arr, toggleId]
    };
  }

  // ── Display helpers ──────────────────────────────────────────────────
  type FlatFacetValue = { id: number; name: string; facetName: string };
  const flatFacetValues: FlatFacetValue[] = $derived(
    data.facets.flatMap((facet) => {
      return facet.values.map((value) => ({
        id: value.id,
        name: value.name ?? value.code,
        facetName: facet.name ?? facet.code
      }));
    })
  );

  function getFacetValueName(id: number): string {
    const fv = flatFacetValues.find((v) => v.id === id);
    return fv ? `${fv.facetName}: ${fv.name}` : `ID: ${id}`;
  }

  function getProductName(product: (typeof data.products)[0]): string {
    return product.name ?? `Product #${product.id}`;
  }

  function getProductNameById(id: number): string {
    const product = data.products.find((p) => p.id === id);
    return product ? getProductName(product) : `Product #${id}`;
  }

  // ── Preview table ────────────────────────────────────────────────────

  function getPreviewProductName(product: PreviewProduct): string {
    return product.name ?? `Product #${product.id}`;
  }

  const previewColumns: ColumnDef<PreviewProduct>[] = [
    {
      accessorFn: (row) => getPreviewProductName(row),
      id: "name",
      header: "Product",
      cell: ({ row }) =>
        renderSnippet(productCell, {
          name: getPreviewProductName(row.original),
          id: row.original.id
        })
    },
    {
      accessorFn: (row) => row.variants.length,
      id: "variants",
      header: "Variants",
      cell: ({ row }) =>
        `${row.original.variants.length} variant${row.original.variants.length !== 1 ? "s" : ""}`
    },
    {
      accessorKey: "visibility",
      header: "Status",
      cell: ({ row }) => renderSnippet(statusCell, { visibility: row.original.visibility })
    }
  ];
</script>

{#snippet productCell({ name, id }: { name: string; id: number })}
  <a href="/admin/products/{id}" class="group inline-flex items-center">
    <span class="font-medium group-hover:underline">
      {name}
    </span>
  </a>
{/snippet}

{#snippet statusCell({ visibility }: { visibility: string })}
  <Badge
    variant={visibility === "public" ? "success" : visibility === "private" ? "warning" : "outline"}
  >
    {visibility === "public" ? "Public" : visibility === "private" ? "Private" : "Draft"}
  </Badge>
{/snippet}

<svelte:head><title>{name || "Edit Collection"} | Admin</title></svelte:head>

<div>
  <div class="mb-6">
    <div class="mb-6 flex items-center justify-between">
      <a
        href="/admin/collections"
        class="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline dark:text-blue-400"
        ><ChevronLeft class="h-4 w-4" /> Back to Collections</a
      >
      <a
        href="/collections/{data.collection.id}/{data.collection.slug}{data.collection.isPrivate
          ? '?preview'
          : ''}"
        target="_blank"
        class="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline dark:text-blue-400"
      >
        Preview <ExternalLink class="h-3.5 w-3.5" />
      </a>
    </div>
    <div class="mt-2 flex items-center justify-between">
      <h1 class="text-2xl font-bold">{name || "Edit Collection"}</h1>
      <div class="flex items-center gap-2">
        {#if cameFromCreate && hasSaved}
          <Button type="button" variant="outline" onclick={() => (createDialogOpen = true)}>
            <Plus class="h-4 w-4" /> Add Collection
          </Button>
        {/if}
        {#if showCancelDelete}
          <form method="POST" action="?/delete" use:enhance>
            <Button type="submit" variant="outline">Cancel</Button>
          </form>
        {/if}
        <Button type="submit" form="collection-form" disabled={isSubmitting}>
          {isSubmitting ? "Saving..." : "Save Changes"}
        </Button>
      </div>
    </div>
  </div>

  <!-- Two Column Layout -->
  <div class="flex flex-col gap-6 lg:flex-row">
    <!-- Main Content (Left) -->
    <div class="flex-1 space-y-6">
      <!-- Main form (basic info + filters submitted together) -->
      <form
        id="collection-form"
        method="POST"
        action="?/update"
        use:enhance={() => {
          isSubmitting = true;
          return async ({ result, update }) => {
            await update({ reset: false });
            isSubmitting = false;
            if (result.type === "success") {
              name = data.collection.name ?? "";
              slug = data.collection.slug ?? "";
              description = data.collection.description ?? "";
              isPrivate = data.collection.isPrivate;
              localFilters = data.collection.filters.map((f) => ({
                key: filterKey++,
                field: f.field,
                operator: f.operator,
                value: structuredClone(f.value)
              }));
              toast.success("Collection updated");
              hasSaved = true;
              showCancelDelete = false;
            }
          };
        }}
        class="space-y-6"
      >
        <input type="hidden" name="filters" value={filtersJson} />
        <input type="hidden" name="is_private" value={isPrivate ? "on" : ""} />

        <div class="overflow-hidden rounded-lg bg-surface shadow">
          <!-- Language Tabs -->
          {#if TRANSLATION_LANGUAGES.length > 0}
            <div class="flex border-b border-border">
              {#each LANGUAGES as lang}
                <button
                  type="button"
                  class={cn(
                    "border-b-2 border-transparent px-4 py-2.5 text-sm font-medium",
                    activeLanguageTab === lang.code
                      ? "border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                  onclick={() => (activeLanguageTab = lang.code)}
                >
                  {lang.name}
                </button>
              {/each}
            </div>
          {/if}

          <!-- Default language fields -->
          <div class={cn(activeLanguageTab !== DEFAULT_LANGUAGE && "hidden")}>
            <div class="space-y-4 p-6">
              <div class="grid grid-cols-2 gap-4">
                <div>
                  <Label for="name">Name <span class="text-red-500">*</span></Label>
                  <Input type="text" id="name" name="name" bind:value={name} required />
                </div>
                <div>
                  <Label for="slug">Slug <span class="text-red-500">*</span></Label>
                  <Input type="text" id="slug" name="slug" bind:value={slug} required />
                </div>
              </div>
              <div>
                <Label for="description">Description</Label>
                <RichTextEditor
                  name="description"
                  content={description}
                  placeholder="Write collection description..."
                  onchange={(html) => (description = html)}
                />
              </div>
            </div>
          </div>

          <!-- Translation language fields -->
          {#each TRANSLATION_LANGUAGES as lang}
            <div class={cn(activeLanguageTab !== lang.code && "hidden")}>
              <div class="space-y-4 p-6">
                <div class="grid grid-cols-2 gap-4">
                  <div>
                    <Label for="translation_{lang.code}_name">Name</Label>
                    <Input
                      type="text"
                      id="translation_{lang.code}_name"
                      name="name_{lang.code}"
                      value={translationMap[lang.code]?.name ?? ""}
                    />
                  </div>
                  <div>
                    <Label for="translation_{lang.code}_slug">Slug</Label>
                    <Input
                      type="text"
                      id="translation_{lang.code}_slug"
                      name="slug_{lang.code}"
                      value={translationMap[lang.code]?.slug ?? ""}
                    />
                  </div>
                </div>
                <div>
                  <Label for="translation_{lang.code}_description">Description</Label>
                  <RichTextEditor
                    name="description_{lang.code}"
                    content={translationMap[lang.code]?.description ?? ""}
                    placeholder="Write collection description..."
                  />
                </div>

                <p class="text-xs text-muted-foreground">
                  Leave empty to use the {LANGUAGES.find((l) => l.code === DEFAULT_LANGUAGE)?.name} value.
                </p>
              </div>
            </div>
          {/each}
        </div>
      </form>

      <!-- Collection Filters -->
      <AdminCard title="Filters">
        {#snippet headerActions()}
          <!-- Add filter dropdown -->
          <DropdownMenu.Root bind:open={addFilterOpen}>
            <DropdownMenu.Trigger>
              {#snippet child({ props })}
                <Button variant="outline" size="sm" {...props}>
                  <Plus class="h-4 w-4" />
                  Add Filter
                </Button>
              {/snippet}
            </DropdownMenu.Trigger>
            <DropdownMenu.Content align="end">
              {#each filterTypes as ft}
                <DropdownMenu.Item
                  onclick={() => {
                    addFilterOpen = false;
                    addFilter(ft.field, ft.operator);
                  }}
                >
                  {ft.label}
                </DropdownMenu.Item>
              {/each}
            </DropdownMenu.Content>
          </DropdownMenu.Root>
        {/snippet}

        {#if localFilters.length > 0}
          <div class="space-y-3">
            {#each localFilters as filter, index (filter.key)}
              {#if index > 0}
                <div class="flex justify-center">
                  <span
                    class="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-foreground-secondary"
                    >AND</span
                  >
                </div>
              {/if}
              <div class="rounded-lg border border-border">
                <!-- Card header -->
                <div class="flex items-center justify-between border-b border-border px-4 py-2.5">
                  <span class="text-sm font-medium">{getFieldLabel(filter.field)}</span>
                  <button
                    type="button"
                    onclick={() => removeFilter(index)}
                    class="rounded p-1 text-muted-foreground hover:bg-destructive-subtle hover:text-red-600"
                    aria-label="Remove filter"
                  >
                    <X class="h-4 w-4" />
                  </button>
                </div>

                <!-- Card body -->
                <div class="p-4">
                  {#if filter.field === "facet"}
                    {@const selected = Array.isArray(filter.value)
                      ? (filter.value as number[])
                      : []}
                    <Popover.Root
                      open={openPopover === filter.key}
                      onOpenChange={(open) => (openPopover = open ? filter.key : null)}
                    >
                      <Popover.Trigger
                        class="flex items-center justify-between rounded-lg border border-input-border bg-surface px-3 py-2 text-sm hover:bg-hover"
                        aria-expanded={openPopover === filter.key}
                        aria-haspopup="listbox"
                      >
                        <span class="text-muted-foreground">Select facet values</span>
                        <ChevronsUpDown class="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Popover.Trigger>
                      <Popover.Content class="w-72 p-0" align="start">
                        <Command.Root>
                          <Command.Input placeholder="Search facet values..." />
                          <Command.List class="max-h-64">
                            <Command.Empty>No facet values found.</Command.Empty>
                            {#each data.facets as facet}
                              <Command.Group heading={facet.name ?? facet.code}>
                                {#each facet.values as value}
                                  <Command.Item
                                    value="{facet.name ?? facet.code} {value.name ?? value.code}"
                                    onSelect={() => toggleArrayValue(index, value.id)}
                                    class="cursor-pointer"
                                  >
                                    <div class="flex w-full items-center gap-2">
                                      <div class="flex h-4 w-4 items-center justify-center">
                                        {#if selected.includes(value.id)}
                                          <Check class="h-4 w-4" />
                                        {/if}
                                      </div>
                                      <span>{value.name ?? value.code}</span>
                                    </div>
                                  </Command.Item>
                                {/each}
                              </Command.Group>
                            {/each}
                          </Command.List>
                        </Command.Root>
                      </Popover.Content>
                    </Popover.Root>
                    {#if selected.length > 0}
                      <div class="mt-3 flex flex-wrap gap-1.5">
                        {#each selected as id}
                          <Badge class="gap-1 text-sm">
                            {getFacetValueName(id)}
                            <button
                              type="button"
                              onclick={() => toggleArrayValue(index, id)}
                              class="ml-0.5 rounded-full p-0.5 hover:bg-blue-200 dark:hover:bg-blue-500/20"
                              aria-label="Remove {getFacetValueName(id)}"
                            >
                              <X class="h-3 w-3" />
                            </button>
                          </Badge>
                        {/each}
                      </div>
                    {/if}
                  {:else if filter.field === "product"}
                    {@const selected = Array.isArray(filter.value)
                      ? (filter.value as number[])
                      : []}
                    <Popover.Root
                      open={openPopover === filter.key}
                      onOpenChange={(open) => (openPopover = open ? filter.key : null)}
                    >
                      <Popover.Trigger
                        class="flex items-center justify-between rounded-lg border border-input-border bg-surface px-3 py-2 text-sm hover:bg-hover"
                        aria-expanded={openPopover === filter.key}
                        aria-haspopup="listbox"
                      >
                        <span class="text-muted-foreground">Select products</span>
                        <ChevronsUpDown class="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Popover.Trigger>
                      <Popover.Content
                        class="w-[var(--bits-popover-trigger-width)] p-0"
                        align="start"
                      >
                        <Command.Root>
                          <Command.Input placeholder="Search products..." />
                          <Command.List class="max-h-60">
                            <Command.Empty>No products found.</Command.Empty>
                            {#each data.products as product}
                              <Command.Item
                                value={getProductName(product)}
                                onSelect={() => toggleArrayValue(index, product.id)}
                                class="cursor-pointer"
                              >
                                <div class="flex w-full items-center gap-2">
                                  <div class="flex h-4 w-4 items-center justify-center">
                                    {#if selected.includes(product.id)}
                                      <Check class="h-4 w-4" />
                                    {/if}
                                  </div>
                                  <span>{getProductName(product)}</span>
                                </div>
                              </Command.Item>
                            {/each}
                          </Command.List>
                        </Command.Root>
                      </Popover.Content>
                    </Popover.Root>
                    {#if selected.length > 0}
                      <div class="mt-3 flex flex-wrap gap-1.5">
                        {#each selected as id}
                          <Badge class="gap-1 text-sm">
                            {getProductNameById(id)}
                            <button
                              type="button"
                              onclick={() => toggleArrayValue(index, id)}
                              class="ml-0.5 rounded-full p-0.5 hover:bg-muted-strong"
                              aria-label="Remove {getProductNameById(id)}"
                            >
                              <X class="h-3 w-3" />
                            </button>
                          </Badge>
                        {/each}
                      </div>
                    {/if}
                  {:else if filter.field === "price"}
                    <div class="flex items-center gap-3">
                      <SelectNative
                        class="w-auto"
                        value={filter.operator}
                        onchange={(e) => {
                          localFilters[index] = {
                            ...filter,
                            operator: (e.target as HTMLSelectElement).value
                          };
                        }}
                      >
                        <option value="gte">at least</option>
                        <option value="lte">at most</option>
                      </SelectNative>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        class="w-32"
                        value={typeof filter.value === "number"
                          ? (filter.value / 100).toFixed(2)
                          : ""}
                        placeholder="0.00"
                        onchange={(e) => {
                          localFilters[index] = {
                            ...filter,
                            value: Math.round(Number((e.target as HTMLInputElement).value) * 100)
                          };
                        }}
                      />
                      <span class="text-sm text-muted-foreground">{BASE_CURRENCY}</span>
                    </div>
                  {:else if filter.field === "stock"}
                    <div class="flex items-center gap-3">
                      <SelectNative
                        class="w-auto"
                        value={filter.operator}
                        onchange={(e) => {
                          localFilters[index] = {
                            ...filter,
                            operator: (e.target as HTMLSelectElement).value
                          };
                        }}
                      >
                        <option value="gt">more than</option>
                        <option value="gte">at least</option>
                      </SelectNative>
                      <Input
                        type="number"
                        class="w-32"
                        value={filter.value}
                        placeholder="Stock level"
                        onchange={(e) => {
                          localFilters[index] = {
                            ...filter,
                            value: Number((e.target as HTMLInputElement).value)
                          };
                        }}
                      />
                    </div>
                  {:else if filter.field === "visibility"}
                    <SelectNative
                      name="visibility"
                      class="w-auto"
                      value={filter.value}
                      onchange={(e) => {
                        localFilters[index] = {
                          ...filter,
                          value: (e.target as HTMLSelectElement).value
                        };
                      }}
                    >
                      <option value="public">Public</option>
                      <option value="private">Private</option>
                      <option value="draft">Draft</option>
                    </SelectNative>
                  {/if}
                </div>
              </div>
            {/each}
          </div>
        {:else}
          <div class="text-center">
            <p class="py-4 text-sm text-muted-foreground">
              No filters defined. Add a filter to populate this collection.
            </p>
          </div>
        {/if}
      </AdminCard>

      <!-- Products -->
      <AdminCard title="Preview Products ({previewCount ?? data.productCount})" noPadding>
        <div class="px-6 pt-4 pb-8">
          <DataTable
            data={previewProducts ?? data.preview}
            columns={previewColumns}
            searchPlaceholder="Filter products..."
            emptyIcon={Package}
            emptyTitle="No products"
            emptyDescription="Add filters above to populate this collection."
          />
        </div>
      </AdminCard>

      <button
        type="button"
        class="text-sm text-red-600 hover:text-red-800 dark:text-red-700"
        onclick={() => (showDelete = true)}
      >
        Delete this collection
      </button>
    </div>

    <!-- Sidebar (Right) -->
    <div class="w-full space-y-6 lg:w-80 lg:shrink-0">
      <!-- Private Section -->
      <AdminCard title="Visibility" variant="sidebar">
        <div class="flex items-center gap-2">
          <Checkbox id="is_private" bind:checked={isPrivate} />
          <label for="is_private" class="text-sm font-medium text-foreground-secondary">
            Private collection
          </label>
        </div>
        <p class="mt-3 text-xs text-muted-foreground">
          Private collections are not visible in the shop
        </p>
      </AdminCard>

      <!-- Images Section -->
      <AdminCard title="Image" variant="sidebar">
        {#snippet headerActions()}
          {#if !data.collection.featuredAsset}
            <Button
              type="button"
              size="sm"
              variant="outline"
              onclick={() => (showImagePicker = true)}
              disabled={isSavingImages}
            >
              <Plus class="h-4 w-4" />
              Add
            </Button>
          {/if}
        {/snippet}
        {#if data.collection.featuredAsset}
          {@const asset = data.collection.featuredAsset}
          <div class="group relative">
            <img
              src={imageUrl(asset.source, 400)}
              alt={asset.alt || asset.name}
              class="h-48 w-full rounded border border-border object-cover"
            />
            <div
              class="absolute inset-0 flex items-center justify-center gap-1 rounded bg-black/50 opacity-0 transition-opacity group-hover:opacity-100"
            >
              <Button
                type="button"
                size="sm"
                variant="secondary"
                class="h-7 w-7 p-0"
                onclick={() =>
                  (editingImageAlt = {
                    id: asset.id,
                    alt: asset.alt || ""
                  })}
              >
                <Pencil class="h-3.5 w-3.5" />
              </Button>
              <form
                method="POST"
                action="?/removeImage"
                use:enhance={() => {
                  return async ({ result, update }) => {
                    await update();
                    if (result.type === "success") {
                      toast.success("Image removed");
                    }
                  };
                }}
              >
                <input type="hidden" name="assetId" value={asset.id} />
                <Button type="submit" variant="destructive" size="sm" class="h-7 w-7 p-0">
                  <Trash2 class="h-3.5 w-3.5" />
                </Button>
              </form>
            </div>
          </div>
        {:else}
          <p class="py-4 text-center text-sm text-muted-foreground">No image yet</p>
        {/if}
      </AdminCard>
    </div>
  </div>

  <DeleteConfirmDialog
    bind:open={showDelete}
    title="Delete Collection?"
    description="Are you sure you want to delete this collection? This action cannot be undone."
  />

  <!-- Image Picker Dialog -->
  <ImagePicker
    bind:open={showImagePicker}
    onClose={() => (showImagePicker = false)}
    onSelect={handleImagesSelected}
  />

  <!-- Edit Image Dialog -->
  <Dialog.Root
    open={editingImageAlt !== null}
    onOpenChange={(open) => !open && (editingImageAlt = null)}
  >
    <Dialog.Content class="max-w-md">
      <Dialog.Header>
        <Dialog.Title>Edit Image</Dialog.Title>
      </Dialog.Header>
      {#if editingImageAlt}
        {@const currentEditingImage = editingImageAlt}
        <div class="space-y-4 py-2">
          {#if data.collection.featuredAsset}
            <img
              src={imageUrl(data.collection.featuredAsset.source, 400)}
              alt={currentEditingImage.alt || data.collection.featuredAsset.name}
              class="mx-auto max-h-96 rounded-lg object-contain"
            />
          {/if}

          <form
            method="POST"
            action="?/updateImageAlt"
            use:enhance={() => {
              return async ({ result, update }) => {
                await update();
                if (result.type === "success") {
                  editingImageAlt = null;
                  toast.success("Image updated");
                }
              };
            }}
          >
            <input type="hidden" name="assetId" value={currentEditingImage.id} />
            <div class="space-y-4">
              <div>
                <Label for="alt-text">Alt text</Label>
                <Input
                  id="alt-text"
                  name="alt"
                  value={currentEditingImage.alt}
                  placeholder="Describe this image..."
                />
                <p class="mt-1 text-xs text-muted-foreground">
                  Describes the image for screen readers and search engines.
                </p>
              </div>
            </div>
            <Dialog.Footer class="mt-4">
              <Button type="button" variant="outline" onclick={() => (editingImageAlt = null)}>
                Cancel
              </Button>
              <Button type="submit">Save</Button>
            </Dialog.Footer>
          </form>
        </div>
      {/if}
    </Dialog.Content>
  </Dialog.Root>
</div>

<UnsavedChangesDialog isDirty={() => hasUnsavedChanges} isSaving={() => isSubmitting} />

<CreateDialog
  bind:open={createDialogOpen}
  title="New Collection"
  action="/admin/collections?/create"
  placeholder="e.g., Summer Sale"
/>
