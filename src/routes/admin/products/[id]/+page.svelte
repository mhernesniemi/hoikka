<script lang="ts">
  import { enhance } from "$app/forms";
  import { goto, invalidateAll } from "$app/navigation";
  import { page } from "$app/state";
  import { onMount } from "svelte";
  import { toast } from "svelte-sonner";
  import { Button } from "$lib/components/admin/ui/button";
  import { Checkbox } from "$lib/components/admin/ui/checkbox";
  import DeleteConfirmDialog from "$lib/components/admin/DeleteConfirmDialog.svelte";
  import CreateDialog from "$lib/components/admin/CreateDialog.svelte";
  import AdminCard from "$lib/components/admin/AdminCard.svelte";
  import { Input } from "$lib/components/admin/ui/input";
  import { Label } from "$lib/components/admin/ui/label";
  import { SelectNative } from "$lib/components/admin/ui/select-native";
  import {
    Table,
    TableHeader,
    TableBody,
    TableRow,
    TableHead,
    TableCell
  } from "$lib/components/admin/ui/table";
  import * as Dialog from "$lib/components/admin/ui/dialog";
  import { Badge } from "$lib/components/admin/ui/badge";
  import IconButton from "$lib/components/admin/IconButton.svelte";
  import ImagePicker from "$lib/components/admin/ImagePicker.svelte";
  import MultiSelectCombobox from "$lib/components/admin/MultiSelectCombobox.svelte";
  import TranslationEditor from "$lib/components/admin/TranslationEditor.svelte";
  import { RichTextEditor } from "$lib/components/admin/ui/rich-text-editor";
  import { translationsToMap, TRANSLATION_LANGUAGES } from "$lib/config/languages.js";
  import { saveImages, type SelectedImage } from "$lib/admin-upload";
  import X from "@lucide/svelte/icons/x";
  import Plus from "@lucide/svelte/icons/plus";
  import Pencil from "@lucide/svelte/icons/pencil";
  import Trash2 from "@lucide/svelte/icons/trash-2";
  import ChevronLeft from "@lucide/svelte/icons/chevron-left";
  import ExternalLink from "@lucide/svelte/icons/external-link";
  import { cn } from "$lib/utils";
  import { imageUrl } from "$lib/image";
  import ImageIcon from "@lucide/svelte/icons/image";
  import CategoryCombobox from "$lib/components/admin/CategoryCombobox.svelte";
  import ProductPicker from "$lib/components/admin/ProductPicker.svelte";
  import UnsavedChangesDialog from "$lib/components/admin/UnsavedChangesDialog.svelte";
  import type { ActionData, PageData } from "./$types";

  let { data, form }: { data: PageData; form: ActionData } = $props();

  let visibility = $state(data.product.visibility);
  let productType = $state(data.product.type);

  // Digital deliverable upload (sidebar card, digital products only)
  let isUploadingDigital = $state(false);
  let digitalError = $state<string | null>(null);

  function formatFileSize(bytes: number): string {
    if (!bytes) return "Unknown size";
    const mb = bytes / (1024 * 1024);
    return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }

  /**
   * Upload the deliverable and attach it to the product. Two steps on purpose:
   * the file streams straight to storage as the raw request body — a
   * multipart form would have to be buffered whole on the server, which a
   * 200 MB deliverable cannot survive — and then only its metadata travels
   * through the form action.
   */
  async function uploadDigitalFile(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    isUploadingDigital = true;
    digitalError = null;
    try {
      const response = await fetch(
        `/api/assets/upload?purpose=digital&filename=${encodeURIComponent(file.name)}`,
        {
          method: "POST",
          headers: { "content-type": file.type || "application/octet-stream" },
          body: file
        }
      );
      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || "Upload failed");
      }
      const uploaded = await response.json();

      const attach = new FormData();
      attach.append("url", uploaded.url);
      attach.append("name", uploaded.name);
      attach.append("size", String(uploaded.size ?? 0));
      if (uploaded.mimeType) attach.append("mimeType", uploaded.mimeType);

      const result = await fetch("?/setDigitalFile", {
        method: "POST",
        body: attach,
        headers: { "x-sveltekit-action": "true" }
      });
      if (!result.ok) throw new Error("Failed to attach the file to this product");

      await invalidateAll();
      toast.success("Digital file saved");
    } catch (e) {
      digitalError = e instanceof Error ? e.message : "Upload failed";
    } finally {
      isUploadingDigital = false;
      input.value = "";
    }
  }

  let cameFromCreate = $state(false);
  let showCancelDelete = $state(false);
  let hasSaved = $state(false);
  let createDialogOpen = $state(false);
  let variantToDelete = $state<{ id: number; sku: string } | null>(null);
  let pendingNavigationUrl = $state<string | null>(null);
  let createVariantDialogOpen = $state(false);
  let newVariantName = $state("");
  let newVariantSku = $state("");
  let newVariantPrice = $state<number | string>("");
  let newVariantStock = $state<number | string>(0);
  let newVariantTrackInventory = $state(false);
  let isCreatingVariant = $state(false);

  // Show toast from URL params (variant redirects)
  onMount(() => {
    const url = page.url;
    if (url.searchParams.has("created")) {
      cameFromCreate = true;
      showCancelDelete = true;
      history.replaceState({}, "", url.pathname);
    } else {
      const messages: Record<string, string> = {
        variantCreated: "Variant created successfully",
        variantDeleted: "Variant deleted successfully"
      };
      for (const [param, message] of Object.entries(messages)) {
        if (url.searchParams.has(param)) {
          toast.success(message);
          history.replaceState({}, "", url.pathname);
          break;
        }
      }
    }
  });

  // Show toast notifications based on form results
  $effect(() => {
    if (form?.error) toast.error(form.error);
    if (form?.imageError) toast.error(form.imageError);
  });

  let showDelete = $state(false);
  let showImagePicker = $state(false);
  let isSavingImages = $state(false);
  let isSavingProduct = $state(false);
  let editingImageAlt = $state<{ id: number; alt: string; isFeatured: boolean } | null>(null);

  // Selected facet values and categories
  let selectedProductFacets = $state<number[]>(data.product.facetValues.map((fv) => fv.id));
  let selectedCategories = $state<number[]>(data.productCategories.map((c) => c.id));

  // Flatten facet values for combobox display (derived from data)
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
    if (selectedProductFacets.includes(id)) {
      selectedProductFacets = selectedProductFacets.filter((fv) => fv !== id);
    } else {
      selectedProductFacets = [...selectedProductFacets, id];
    }
  }

  // Flatten tree into list with depth info for display
  type FlatCategory = {
    id: number;
    name: string;
    depth: number;
  };

  function flattenTree(nodes: typeof data.categoryTree, depth = 0): FlatCategory[] {
    return nodes.flatMap((node) => [
      {
        id: node.id,
        name: node.name,
        depth
      },
      ...flattenTree(node.children, depth + 1)
    ]);
  }

  const flatCategories = $derived(flattenTree(data.categoryTree));

  // Get selected category objects for display
  function getSelectedCategoryObjects() {
    return flatCategories.filter((c) => selectedCategories.includes(c.id));
  }

  // Toggle category selection
  function toggleCategory(id: number) {
    if (selectedCategories.includes(id)) {
      selectedCategories = selectedCategories.filter((c) => c !== id);
    } else {
      selectedCategories = [...selectedCategories, id];
    }
  }

  // Remove a category from selection
  function removeCategory(id: number) {
    selectedCategories = selectedCategories.filter((c) => c !== id);
  }

  let selectedRelatedIds = $state<number[]>(data.relatedProducts.map((p) => p.id));

  // Products available for the picker (exclude current product)
  const pickerProducts = $derived(data.allProducts.filter((p) => p.id !== data.product.id));

  function toggleRelatedProduct(product: { id: number; name: string; image: string | null }) {
    if (selectedRelatedIds.includes(product.id)) {
      selectedRelatedIds = selectedRelatedIds.filter((id) => id !== product.id);
    } else {
      selectedRelatedIds = [...selectedRelatedIds, product.id];
    }
  }

  function removeRelatedProduct(id: number) {
    selectedRelatedIds = selectedRelatedIds.filter((rid) => rid !== id);
  }

  function getSelectedRelatedProducts() {
    return selectedRelatedIds
      .map((id) => data.allProducts.find((p) => p.id === id))
      .filter((p) => p !== undefined);
  }

  let productName = $state(data.product.name);
  let productSlug = $state(data.product.slug);
  let productDescription = $state(data.product.description ?? "");
  const translationMap = $derived(translationsToMap(data.translations));

  const hasUnsavedChanges = $derived.by(() => {
    return (
      productName !== data.product.name ||
      productSlug !== data.product.slug ||
      productDescription !== (data.product.description ?? "") ||
      visibility !== data.product.visibility ||
      [...selectedProductFacets].sort().join() !==
        data.product.facetValues
          .map((fv) => fv.id)
          .sort()
          .join() ||
      [...selectedCategories].sort().join() !==
        data.productCategories
          .map((c) => c.id)
          .sort()
          .join() ||
      [...selectedRelatedIds].sort().join() !==
        data.relatedProducts
          .map((p) => p.id)
          .sort()
          .join()
    );
  });

  async function handleImagesSelected(files: SelectedImage[]) {
    isSavingImages = true;
    const error = await saveImages("?/addImage", files);
    if (error) toast.error(error);
    isSavingImages = false;
  }
</script>

<svelte:head><title>{productName || "Edit Product"} | Admin</title></svelte:head>

<div>
  <div class="mb-6">
    <div class="mb-6 flex items-center justify-between">
      <a
        href="/admin/products"
        class="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline dark:text-blue-400"
        ><ChevronLeft class="h-4 w-4" /> Back to Products</a
      >
      <a
        href="/products/{data.product.id}/{data.product.slug}{data.product.visibility === 'public'
          ? ''
          : '?preview'}"
        target="_blank"
        class="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline dark:text-blue-400"
      >
        Preview <ExternalLink class="h-3.5 w-3.5" />
      </a>
    </div>
    <div class="mt-2 flex items-center justify-between">
      <h1 class="text-2xl font-bold">{productName || "Edit Product"}</h1>
      <div class="flex items-center gap-2">
        {#if cameFromCreate && hasSaved}
          <Button type="button" variant="outline" onclick={() => (createDialogOpen = true)}>
            <Plus class="h-4 w-4" /> Add Product
          </Button>
        {/if}
        {#if showCancelDelete}
          <form method="POST" action="?/delete" use:enhance>
            <Button type="submit" variant="outline">Cancel</Button>
          </form>
        {/if}
        <Button type="submit" form="product-form" disabled={isSavingProduct}>
          {isSavingProduct ? "Saving..." : "Save Changes"}
        </Button>
      </div>
    </div>
  </div>

  <!-- Two Column Layout -->
  <div class="flex flex-col gap-6 lg:flex-row">
    <!-- Main Content (Left) -->
    <div class="flex-1 space-y-6">
      <!-- Product Form -->
      <form
        id="product-form"
        method="POST"
        action="?/update"
        use:enhance={() => {
          isSavingProduct = true;
          return async ({ result, update }) => {
            await update({ reset: false });
            isSavingProduct = false;
            if (result.type === "success") {
              productName = data.product.name;
              productSlug = data.product.slug;
              productDescription = data.product.description ?? "";
              visibility = data.product.visibility;
              selectedProductFacets = data.product.facetValues.map((fv) => fv.id);
              selectedCategories = data.productCategories.map((c) => c.id);
              selectedRelatedIds = data.relatedProducts.map((p) => p.id);
              if (pendingNavigationUrl) {
                const url = pendingNavigationUrl;
                pendingNavigationUrl = null;
                goto(url);
                return;
              }
              toast.success("Product updated successfully");
              hasSaved = true;
              showCancelDelete = false;
            }
          };
        }}
        class="overflow-hidden rounded-lg bg-surface shadow"
      >
        <div class="space-y-4 p-6">
          <div class="grid grid-cols-2 gap-4">
            <div>
              <Label for="name">Name <span class="text-red-500">*</span></Label>
              <Input type="text" id="name" name="name" bind:value={productName} required />
            </div>

            <div>
              <Label for="slug">Slug <span class="text-red-500">*</span></Label>
              <Input type="text" id="slug" name="slug" bind:value={productSlug} required />
            </div>
          </div>

          <div>
            <Label for="description">Description</Label>
            <RichTextEditor
              name="description"
              content={data.product.description ?? ""}
              placeholder="Write product description..."
              onchange={(html) => (productDescription = html)}
            />
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
        formId="product-form"
      />

      <!-- Images Section -->
      <AdminCard title="Images">
        {#snippet headerActions()}
          <Button
            type="button"
            size="sm"
            variant="outline"
            onclick={() => (showImagePicker = true)}
            disabled={isSavingImages}
          >
            <Plus class="h-4 w-4" />
            Add Image
          </Button>
        {/snippet}
        {#if data.product.assets.length > 0}
          <div class="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
            {#each data.product.assets as asset}
              <div class="group relative">
                <img
                  src={imageUrl(asset.source, 200)}
                  alt={asset.alt || asset.name}
                  class={cn(
                    "h-36 w-full rounded-lg border border-border object-cover",
                    data.product.featuredAssetId === asset.id && "ring-2 ring-blue-500"
                  )}
                />
                <div
                  class="absolute inset-0 flex items-center justify-center gap-1 rounded-lg bg-black/50 opacity-0 transition-opacity group-hover:opacity-100"
                >
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    class="h-8 w-8 p-0"
                    onclick={() =>
                      (editingImageAlt = {
                        id: asset.id,
                        alt: asset.alt || "",
                        isFeatured: data.product.featuredAssetId === asset.id
                      })}
                  >
                    <Pencil class="h-4 w-4" />
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
                    <Button type="submit" variant="destructive" size="sm" class="h-8 w-8 p-0">
                      <Trash2 class="h-4 w-4" />
                    </Button>
                  </form>
                </div>
                {#if data.product.featuredAssetId === asset.id}
                  <span
                    class="absolute top-1 left-1 rounded bg-blue-600 px-1.5 py-0.5 text-xs text-white"
                    >Featured</span
                  >
                {/if}
              </div>
            {/each}
          </div>
        {:else}
          <p class="py-4 text-center text-sm text-muted-foreground">No images yet</p>
        {/if}
      </AdminCard>

      <!-- Variants Section -->
      <AdminCard title="Variants" noPadding>
        {#snippet headerActions()}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onclick={() => {
              newVariantName = "";
              newVariantSku = "";
              newVariantPrice = "";
              newVariantStock = 0;
              newVariantTrackInventory = false;
              createVariantDialogOpen = true;
            }}
          >
            <Plus class="h-4 w-4" /> Add Variant
          </Button>
        {/snippet}
        <!-- Variants Table -->
        <Table class="rounded-none border-0 shadow-none">
          <TableHeader>
            <TableRow class="hover:bg-transparent">
              <TableHead class="w-12"></TableHead>
              <TableHead>SKU</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Price</TableHead>
              <TableHead>Stock</TableHead>
              <TableHead>Facets</TableHead>
              <TableHead class="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {#if data.product.variants.length === 0}
              <TableRow class="hover:bg-transparent">
                <TableCell colspan={7} class="py-8 text-center text-sm text-muted-foreground">
                  No variants yet. Add a variant to start selling this product.
                </TableCell>
              </TableRow>
            {:else}
              {#each data.product.variants as variant}
                <TableRow>
                  <TableCell class="w-12 pr-0">
                    {#if variant.imageUrl}
                      <img
                        src={imageUrl(variant.imageUrl, 64)}
                        alt={variant.name || variant.sku}
                        class="h-8 w-8 rounded object-cover"
                      />
                    {:else}
                      <div class="flex h-8 w-8 items-center justify-center rounded bg-muted">
                        <ImageIcon class="h-4 w-4 text-placeholder" />
                      </div>
                    {/if}
                  </TableCell>
                  <TableCell class="font-mono text-sm">
                    <span class="flex items-center gap-1.5">
                      {variant.sku}
                      {#if variant.isFeatured}
                        <Badge variant="secondary" class="text-xs">Featured</Badge>
                      {/if}
                    </span>
                  </TableCell>
                  <TableCell class="text-sm">
                    <button
                      type="button"
                      class="text-left hover:underline"
                      onclick={() => {
                        const url = `/admin/products/${data.product.id}/variants/${variant.id}`;
                        if (hasUnsavedChanges) {
                          pendingNavigationUrl = url;
                          document.querySelector<HTMLFormElement>("#product-form")?.requestSubmit();
                        } else {
                          goto(url);
                        }
                      }}
                    >
                      {variant.name}
                    </button>
                  </TableCell>
                  <TableCell class="text-sm">{(variant.price / 100).toFixed(2)} EUR</TableCell>
                  <TableCell
                    class={cn(
                      "text-sm",
                      variant.trackInventory ? "text-foreground" : "text-placeholder"
                    )}>{variant.trackInventory ? variant.stock : "Unlimited"}</TableCell
                  >
                  <TableCell class="text-sm">
                    {#if variant.facetValues.length === 0}
                      <span class="text-placeholder">None</span>
                    {:else}
                      <div class="flex flex-wrap gap-1">
                        {#each variant.facetValues as fv}
                          <span class="rounded bg-muted px-2 py-0.5 text-xs">{fv.name}</span>
                        {/each}
                      </div>
                    {/if}
                  </TableCell>
                  <TableCell class="text-right text-sm">
                    <div class="flex items-center justify-end gap-1">
                      <IconButton
                        icon={Pencil}
                        tooltip="Edit variant"
                        onclick={() => {
                          const url = `/admin/products/${data.product.id}/variants/${variant.id}`;
                          if (hasUnsavedChanges) {
                            pendingNavigationUrl = url;
                            document
                              .querySelector<HTMLFormElement>("#product-form")
                              ?.requestSubmit();
                          } else {
                            goto(url);
                          }
                        }}
                      />
                      <IconButton
                        icon={Trash2}
                        tooltip="Delete variant"
                        variant="danger"
                        onclick={() => (variantToDelete = { id: variant.id, sku: variant.sku })}
                      />
                    </div>
                  </TableCell>
                </TableRow>
              {/each}
            {/if}
          </TableBody>
        </Table>
      </AdminCard>
      <button
        type="button"
        class="text-sm text-red-600 hover:text-red-800 dark:text-red-700"
        onclick={() => (showDelete = true)}
      >
        Delete this product
      </button>
    </div>

    <!-- Sidebar (Right) -->
    <div class="w-full space-y-6 lg:w-80 lg:shrink-0">
      <!-- Visibility Section -->
      <AdminCard title="Visibility" variant="sidebar">
        <div class="relative">
          <span
            class={cn(
              "pointer-events-none absolute top-1/2 left-3 h-2 w-2 -translate-y-1/2 rounded-full",
              visibility === "public"
                ? "bg-green-500"
                : visibility === "private"
                  ? "bg-yellow-500"
                  : "bg-gray-400"
            )}
          ></span>
          <SelectNative form="product-form" name="visibility" class="pl-7" bind:value={visibility}>
            <option value="draft">Draft</option>
            <option value="public">Public</option>
            <option value="private">Private</option>
          </SelectNative>
        </div>
        <p class="mt-3 text-xs text-muted-foreground">
          Set this to Public to make it available in the store
        </p>
      </AdminCard>

      <!-- Product Type Section (only shown when multiple types exist) -->
      {#if data.productTypes.length > 1}
        <AdminCard title="Product Type" variant="sidebar">
          <SelectNative form="product-form" name="type" bind:value={productType}>
            {#each data.productTypes as type}
              <option value={type}>
                {type.charAt(0).toUpperCase() + type.slice(1)}
              </option>
            {/each}
          </SelectNative>
        </AdminCard>
      {/if}

      <!-- Digital File Section (deliverable for digital products) -->
      {#if productType === "digital"}
        <AdminCard title="Digital File" variant="sidebar">
          {#if data.digitalAsset}
            <div class="flex items-start justify-between gap-2">
              <div class="min-w-0">
                <p class="truncate text-sm font-medium">{data.digitalAsset.name}</p>
                <p class="text-xs text-muted-foreground">
                  {formatFileSize(data.digitalAsset.fileSize ?? 0)}
                </p>
              </div>
              <form method="POST" action="?/removeDigitalFile" use:enhance>
                <Button type="submit" variant="destructive" size="sm">Remove</Button>
              </form>
            </div>
          {:else}
            <p class="text-sm text-muted-foreground">
              No file yet — buyers of this product cannot be delivered anything.
            </p>
          {/if}

          <div class="mt-3">
            <Input
              type="file"
              accept=".pdf,.epub,.zip,.mp3,.wav,.mp4,.txt,.csv"
              disabled={isUploadingDigital}
              onchange={uploadDigitalFile}
            />
            <p class="mt-2 text-xs text-muted-foreground">
              {isUploadingDigital
                ? "Uploading…"
                : "PDF, EPUB, ZIP, MP3, WAV, MP4, TXT or CSV. Up to 200 MB."}
            </p>
            {#if digitalError}
              <p class="text-destructive mt-2 text-xs">{digitalError}</p>
            {/if}
          </div>
        </AdminCard>
      {/if}

      <!-- Facet Values Section -->
      <AdminCard title="Facet Values" variant="sidebar">
        {#if data.facets.length === 0}
          <p class="text-sm text-muted-foreground">No facets defined.</p>
        {:else}
          <MultiSelectCombobox
            items={facetItems}
            selected={selectedProductFacets}
            onToggle={toggleFacetValue}
            placeholder="Select facet values..."
            searchPlaceholder="Search facet values..."
            emptyText="No facet value found."
            form="product-form"
            name="facetValueIds"
          />
        {/if}
      </AdminCard>

      <!-- Categories Section -->
      <AdminCard title="Categories" variant="sidebar">
        {#if data.categoryTree.length === 0}
          <p class="text-sm text-muted-foreground">No categories defined.</p>
        {:else}
          <CategoryCombobox
            mode="multi"
            categories={flatCategories}
            selected={selectedCategories}
            onToggle={toggleCategory}
          />

          <!-- Selected categories -->
          {#if selectedCategories.length > 0}
            <div class="mt-3 flex flex-wrap gap-1.5">
              {#each getSelectedCategoryObjects() as category}
                <Badge class="gap-1">
                  {category.name}
                  <button
                    type="button"
                    onclick={() => removeCategory(category.id)}
                    class="ml-0.5 rounded-full p-0.5 hover:bg-blue-200 dark:hover:bg-blue-500/20"
                    aria-label="Remove {category.name}"
                  >
                    <X class="h-3 w-3" />
                  </button>
                </Badge>
                <input form="product-form" type="hidden" name="categoryIds" value={category.id} />
              {/each}
            </div>
          {/if}
        {/if}
      </AdminCard>

      <!-- Collections Section -->
      {#if data.productCollections.length > 0}
        <AdminCard title="Collections" variant="sidebar">
          <div class="space-y-1.5">
            {#each data.productCollections as collection}
              <a
                href="/admin/collections/{collection.id}"
                class="block text-sm text-blue-600 hover:underline dark:text-blue-400"
              >
                {collection.name}
              </a>
            {/each}
          </div>
        </AdminCard>
      {/if}

      <!-- Related Products Section -->
      <AdminCard title="Related Products" variant="sidebar">
        <ProductPicker
          products={pickerProducts}
          selected={selectedRelatedIds}
          onToggle={toggleRelatedProduct}
        />

        {#if selectedRelatedIds.length > 0}
          <div class="mt-3 flex flex-wrap gap-1.5">
            {#each getSelectedRelatedProducts() as relProduct}
              <Badge class="gap-1">
                {relProduct.name}
                <button
                  type="button"
                  onclick={() => removeRelatedProduct(relProduct.id)}
                  class="ml-0.5 rounded-full p-0.5 hover:bg-blue-200 dark:hover:bg-blue-500/20"
                  aria-label="Remove {relProduct.name}"
                >
                  <X class="h-3 w-3" />
                </button>
              </Badge>
              <input
                form="product-form"
                type="hidden"
                name="relatedProductIds"
                value={relProduct.id}
              />
            {/each}
          </div>
        {/if}
      </AdminCard>
    </div>
  </div>

  <DeleteConfirmDialog
    bind:open={showDelete}
    title="Delete Product?"
    description="Are you sure you want to delete this product? This action cannot be undone."
  />

  {#if variantToDelete}
    {@const currentVariantToDelete = variantToDelete}
    <DeleteConfirmDialog
      open={true}
      ondeleted={() => (variantToDelete = null)}
      oncancelled={() => (variantToDelete = null)}
      title="Delete Variant?"
      description="Are you sure you want to delete variant &quot;{currentVariantToDelete.sku}&quot;? This action cannot be undone."
      action="?/deleteVariant"
    >
      <input type="hidden" name="variantId" value={currentVariantToDelete.id} />
    </DeleteConfirmDialog>
  {/if}

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
        {@const editingAsset = data.product.assets.find((a) => a.id === currentEditingImage.id)}
        <div class="space-y-4 py-2">
          {#if editingAsset}
            <img
              src={imageUrl(editingAsset.source, 400)}
              alt={currentEditingImage.alt || editingAsset.name}
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
                  if (result.data?.featuredSet) {
                    toast.success("Featured image updated");
                  } else if (result.data?.altUpdated) {
                    toast.success("Image updated");
                  }
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

              {#each TRANSLATION_LANGUAGES as lang}
                {@const assetTrans = data.assetTranslationsMap[currentEditingImage.id]}
                {@const langRow = assetTrans?.find((t) => t.languageCode === lang.code)}
                <div>
                  <Label for="alt-text-{lang.code}">Alt text ({lang.name})</Label>
                  <Input
                    id="alt-text-{lang.code}"
                    name="alt_{lang.code}"
                    value={langRow?.alt ?? ""}
                    placeholder="Describe this image in {lang.name}..."
                  />
                </div>
              {/each}

              <label class="flex items-center gap-2">
                <Checkbox
                  checked={currentEditingImage.isFeatured}
                  disabled={currentEditingImage.isFeatured}
                  name="setFeatured"
                  value="true"
                />
                <span class="text-sm text-foreground-secondary">Featured image</span>
              </label>
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

<UnsavedChangesDialog isDirty={() => hasUnsavedChanges} isSaving={() => isSavingProduct} />

<CreateDialog
  bind:open={createDialogOpen}
  title="New Product"
  action="/admin/products?/create"
  placeholder="e.g., Winter Jacket"
/>

<!-- Create Variant Dialog -->
<Dialog.Root bind:open={createVariantDialogOpen}>
  <Dialog.Content>
    <Dialog.Header>
      <Dialog.Title>New Variant</Dialog.Title>
    </Dialog.Header>
    <form
      method="POST"
      action="?/createVariant"
      use:enhance={() => {
        isCreatingVariant = true;
        return async ({ result, update }) => {
          await update({ reset: false });
          isCreatingVariant = false;
          if (result.type === "success") {
            createVariantDialogOpen = false;
            toast.success("Variant created successfully");
          }
        };
      }}
    >
      <div class="my-4 space-y-4">
        <div class="grid grid-cols-2 gap-4">
          <div>
            <Label for="create_variant_name">Name</Label>
            <Input
              type="text"
              id="create_variant_name"
              name="variant_name"
              bind:value={newVariantName}
              placeholder="e.g., Small"
            />
          </div>
          <div>
            <Label for="create_variant_sku">SKU <span class="text-red-500">*</span></Label>
            <Input
              type="text"
              id="create_variant_sku"
              name="sku"
              bind:value={newVariantSku}
              required
              placeholder="e.g., SKU-001"
            />
          </div>
        </div>
        <div class="grid grid-cols-2 gap-4">
          <div>
            <Label for="create_variant_stock">Stock</Label>
            {#if newVariantTrackInventory}
              <Input
                type="number"
                id="create_variant_stock"
                name="stock"
                min="0"
                bind:value={newVariantStock}
              />
            {:else}
              <Input
                type="text"
                id="create_variant_stock"
                disabled
                placeholder="Unlimited"
                class="bg-muted text-muted-foreground placeholder:text-muted-foreground"
              />
            {/if}
          </div>
          <div>
            <Label for="create_variant_price">Price (EUR) <span class="text-red-500">*</span></Label
            >
            <Input
              type="number"
              id="create_variant_price"
              name="price"
              step="0.01"
              min="0"
              bind:value={newVariantPrice}
              required
              placeholder="0.00"
            />
          </div>
        </div>
        <div class="flex items-center gap-2">
          <Checkbox id="create_variant_trackInventory" bind:checked={newVariantTrackInventory} />
          <label for="create_variant_trackInventory" class="text-sm text-foreground-secondary">
            Track inventory
          </label>
        </div>
        {#if newVariantTrackInventory}
          <input type="hidden" name="trackInventory" value="on" />
        {/if}
      </div>
      <Dialog.Footer>
        <Button type="button" variant="outline" onclick={() => (createVariantDialogOpen = false)}>
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={!newVariantSku.trim() || !newVariantPrice || isCreatingVariant}
        >
          {isCreatingVariant ? "Creating..." : "Create"}
        </Button>
      </Dialog.Footer>
    </form>
  </Dialog.Content>
</Dialog.Root>
