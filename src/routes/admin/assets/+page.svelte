<script lang="ts">
  import { enhance } from "$app/forms";
  import { Button } from "$lib/components/admin/ui/button";
  import { Checkbox } from "$lib/components/admin/ui/checkbox";
  import DeleteConfirmDialog from "$lib/components/admin/DeleteConfirmDialog.svelte";
  import ImagePicker from "$lib/components/admin/ImagePicker.svelte";
  import { imageUrl } from "$lib/image";
  import { formatDate, formatFileSize, cn } from "$lib/utils";
  import { toast } from "svelte-sonner";
  import ImageIcon from "@lucide/svelte/icons/image";
  import Plus from "@lucide/svelte/icons/plus";
  import Trash2 from "@lucide/svelte/icons/trash-2";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();

  let selectedIds = $state<Set<number>>(new Set());
  let showBulkDelete = $state(false);
  let showImagePicker = $state(false);

  function toggleSelection(id: number) {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    selectedIds = next;
  }

  function toggleAll() {
    if (selectedIds.size === data.assets.length) {
      selectedIds = new Set();
    } else {
      selectedIds = new Set(data.assets.map((a) => a.id));
    }
  }

  async function handleImagesUploaded(
    files: {
      url: string;
      name: string;
      width: number;
      height: number;
      size: number;
      alt: string;
    }[]
  ) {
    try {
      for (const file of files) {
        const formData = new FormData();
        formData.append("url", file.url);
        formData.append("name", file.name);
        formData.append("width", file.width.toString());
        formData.append("height", file.height.toString());
        formData.append("fileSize", file.size.toString());
        formData.append("alt", file.alt);

        await fetch("?/addAsset", { method: "POST", body: formData });
      }
      window.location.reload();
    } catch {
      toast.error("Failed to save assets");
    }
  }
</script>

<svelte:head><title>Assets | Admin</title></svelte:head>

<div>
  <div class="mb-6 flex items-center justify-between">
    <h1 class="text-2xl leading-[40px] font-bold">Assets</h1>
    <div class="flex items-center gap-2">
      {#if selectedIds.size > 0}
        <Button variant="destructive" size="sm" onclick={() => (showBulkDelete = true)}>
          <Trash2 class="h-4 w-4" />
          Delete ({selectedIds.size})
        </Button>
      {/if}
      {#if data.assets.length > 0}
        <Button onclick={() => (showImagePicker = true)}>
          <Plus class="h-4 w-4" /> Upload
        </Button>
      {/if}
    </div>
  </div>

  {#if data.assets.length === 0}
    <div
      class="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-16"
    >
      <ImageIcon class="mb-3 h-12 w-12 text-muted-foreground" />
      <h2 class="mb-1 text-lg font-semibold">No assets</h2>
      <p class="mb-4 text-sm text-muted-foreground">Upload images to get started.</p>
      <Button onclick={() => (showImagePicker = true)}>
        <Plus class="h-4 w-4" /> Upload
      </Button>
    </div>
  {:else}
    <!-- Select all -->
    <div class="mb-4 flex items-center gap-2">
      <Checkbox
        checked={selectedIds.size === data.assets.length}
        indeterminate={selectedIds.size > 0 && selectedIds.size < data.assets.length}
        onCheckedChange={() => toggleAll()}
        aria-label="Select all"
      />
      <span class="text-sm text-muted-foreground">
        {selectedIds.size > 0
          ? `${selectedIds.size} of ${data.assets.length} selected`
          : `${data.assets.length} assets`}
      </span>
    </div>

    <!-- Asset Grid -->
    <div class="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
      {#each data.assets as asset}
        <div
          class={cn(
            "group relative overflow-hidden rounded-lg border-2 transition-all",
            selectedIds.has(asset.id)
              ? "border-blue-500 ring-2 ring-blue-200 dark:ring-blue-500/30"
              : "border-border hover:border-input-border"
          )}
        >
          <!-- Checkbox overlay -->
          <div
            class={cn(
              "absolute top-2 left-2 z-10 rounded bg-white p-0.5 transition-opacity dark:bg-black",
              selectedIds.has(asset.id) ? "opacity-100" : "opacity-0 group-hover:opacity-100"
            )}
          >
            <Checkbox
              checked={selectedIds.has(asset.id)}
              onCheckedChange={() => toggleSelection(asset.id)}
              aria-label="Select {asset.name}"
              class="border-2 border-black/40 dark:border-white/40"
            />
          </div>

          <a href="/admin/assets/{asset.id}" class="block">
            <div class="aspect-square bg-muted">
              <img
                src={imageUrl(asset.source, 300)}
                alt={asset.alt || asset.name}
                class="h-full w-full object-cover"
              />
            </div>
            <div class="p-2">
              <p class="truncate text-sm font-medium">{asset.name}</p>
              <p class="text-xs text-muted-foreground">
                {#if asset.width && asset.height}
                  {asset.width}&times;{asset.height}
                {/if}
                {#if asset.fileSize}
                  &middot; {formatFileSize(asset.fileSize)}
                {/if}
              </p>
              <p class="text-xs text-muted-foreground">{formatDate(asset.createdAt)}</p>
            </div>
          </a>
        </div>
      {/each}
    </div>
  {/if}
</div>

<ImagePicker
  bind:open={showImagePicker}
  onClose={() => (showImagePicker = false)}
  onSelect={handleImagesUploaded}
  folder="products"
  uploadOnly
/>

<DeleteConfirmDialog
  bind:open={showBulkDelete}
  title="Delete selected assets?"
  description="Are you sure you want to delete {selectedIds.size} selected asset(s)? This will also remove them from any products using them. This action cannot be undone."
  action="?/deleteSelected"
  ondeleted={() => (selectedIds = new Set())}
>
  {#each [...selectedIds] as id}
    <input type="hidden" name="ids" value={id} />
  {/each}
</DeleteConfirmDialog>
