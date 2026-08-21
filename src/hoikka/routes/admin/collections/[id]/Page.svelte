<script lang="ts">
  import hoikkaConfig from "$hoikka/config";
  import FieldRenderer from "@hoikka/core/admin/FieldRenderer.svelte";
  import { deserialize, enhance } from "$app/forms";
  import { page } from "$app/state";
  import { onMount } from "svelte";
  import { toast } from "svelte-sonner";
  import type { ColumnDef } from "@tanstack/table-core";
  import { DataTable, renderSnippet } from "@hoikka/core/admin/data-table/index";
  import { Button } from "@hoikka/core/admin/ui/button/index";
  import { Badge } from "@hoikka/core/admin/ui/badge/index";
  import { Checkbox } from "@hoikka/core/admin/ui/checkbox/index";
  import { Input } from "@hoikka/core/admin/ui/input/index";
  import { Label } from "@hoikka/core/admin/ui/label/index";
  import { SelectNative } from "@hoikka/core/admin/ui/select-native/index";
  import { RichTextEditor } from "@hoikka/core/admin/ui/rich-text-editor/index";
  import AdminCard from "@hoikka/core/admin/AdminCard.svelte";
  import DeleteConfirmDialog from "@hoikka/core/admin/DeleteConfirmDialog.svelte";
  import CreateDialog from "@hoikka/core/admin/CreateDialog.svelte";
  import ImagePicker from "@hoikka/core/admin/ImagePicker.svelte";
  import MultiSelectCombobox from "@hoikka/core/admin/MultiSelectCombobox.svelte";
  import TranslationEditor from "@hoikka/core/admin/TranslationEditor.svelte";
  import { translationsToMap } from "@hoikka/core/config/derived";
  import { BASE_CURRENCY } from "@hoikka/core/shared/utils";
  import { imageUrl } from "@hoikka/core/shared/image";
  import { saveImages, type SelectedImage } from "@hoikka/core/admin/upload";
  import UnsavedChangesDialog from "@hoikka/core/admin/UnsavedChangesDialog.svelte";
  import * as Dialog from "@hoikka/core/admin/ui/dialog/index";
  import * as DropdownMenu from "@hoikka/core/admin/ui/dropdown-menu/index";
  import X from "@lucide/svelte/icons/x";

  import ChevronLeft from "@lucide/svelte/icons/chevron-left";
  import ExternalLink from "@lucide/svelte/icons/external-link";
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
    data.collection.filters.map((f: any) => ({
      key: filterKey++,
      field: f.field,
      operator: f.operator,
      value: structuredClone(f.value)
    }))
  );

  // Serialized filters for the hidden form input
  const filtersJson = $derived(
    JSON.stringify(
      localFilters.map((f: any) => ({ field: f.field, operator: f.operator, value: f.value }))
    )
  );

  // Unsaved changes detection
  const hasUnsavedChanges = $derived.by(() => {
    const savedName = data.collection.name ?? "";
    const savedSlug = data.collection.slug ?? "";
    const savedDescription = data.collection.description ?? "";
    const savedIsPrivate = data.collection.isPrivate;
    const savedFilters = JSON.stringify(
      data.collection.filters.map((f: any) => ({
        field: f.field,
        operator: f.operator,
        value: f.value
      }))
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
  async function handleImagesSelected(files: SelectedImage[]) {
    isSavingImages = true;
    const error = await saveImages("?/addImage", files);
    if (error) toast.error(error);
    isSavingImages = false;
  }

  // ── Filter helpers ───────────────────────────────────────────────────
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
  }

  function removeFilter(index: number) {
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
  const facetItems = $derived(
    data.facets.flatMap((facet: any) => {
      return facet.values.map((value: any) => ({
        id: value.id,
        label: value.name ?? value.code,
        group: facet.name ?? facet.code,
        badgeLabel: `${facet.name ?? facet.code}: ${value.name ?? value.code}`
      }));
    })
  );

  function getProductName(product: (typeof data.products)[0]): string {
    return product.name ?? `Product #${product.id}`;
  }

  const productItems = $derived(
    data.products.map((product: any) => ({ id: product.id, label: getProductName(product) }))
  );

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
              localFilters = data.collection.filters.map((f: any) => ({
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
      </form>

      <!-- Translations -->
      <TranslationEditor
        fields={[
          { name: "name", label: "Name", type: "text" },
          { name: "slug", label: "Slug", type: "text" },
          { name: "description", label: "Description", type: "richtext" }
        ]}
        translations={translationMap}
        formId="collection-form"
      />

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
                    <MultiSelectCombobox
                      items={facetItems}
                      {selected}
                      onToggle={(id) => toggleArrayValue(index, id)}
                      placeholder="Select facet values"
                      searchPlaceholder="Search facet values..."
                      emptyText="No facet values found."
                    />
                  {:else if filter.field === "product"}
                    {@const selected = Array.isArray(filter.value)
                      ? (filter.value as number[])
                      : []}
                    <MultiSelectCombobox
                      items={productItems}
                      {selected}
                      onToggle={(id) => toggleArrayValue(index, id)}
                      placeholder="Select products"
                      searchPlaceholder="Search products..."
                      emptyText="No products found."
                    />
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
      {#if hoikkaConfig.collections.fields.length > 0}
        <AdminCard title="Details" variant="sidebar">
          <div class="space-y-4">
            <FieldRenderer
              defs={hoikkaConfig.collections.fields}
              values={data.collection.customFields ?? {}}
              formId="collection-form"
            />
          </div>
        </AdminCard>
      {/if}

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
