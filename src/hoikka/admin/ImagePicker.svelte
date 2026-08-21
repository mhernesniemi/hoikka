<script lang="ts">
  import { cn } from "@hoikka/core/shared/utils";
  import { imageUrl } from "@hoikka/core/shared/image";
  import * as Dialog from "@hoikka/core/admin/ui/dialog/index";
  import { Button } from "@hoikka/core/admin/ui/button/index";
  import { Input } from "@hoikka/core/admin/ui/input/index";
  import { Label } from "@hoikka/core/admin/ui/label/index";
  import Upload from "@lucide/svelte/icons/upload";
  import ImageIcon from "@lucide/svelte/icons/image";
  import Check from "@lucide/svelte/icons/check";
  import Loader2 from "@lucide/svelte/icons/loader-2";
  import ArrowLeft from "@lucide/svelte/icons/arrow-left";

  interface BlobFile {
    url: string;
    name: string;
    size: number;
    uploadedAt: string;
  }

  interface SelectedImage {
    url: string;
    name: string;
    width: number;
    height: number;
    size: number;
    alt: string;
  }

  interface Props {
    open: boolean;
    onClose: () => void;
    onSelect: (files: SelectedImage[]) => void;
    folder?: string;
    uploadOnly?: boolean;
  }

  let {
    open = $bindable(),
    onClose,
    onSelect,
    folder = "products",
    uploadOnly = false
  }: Props = $props();

  let activeTab = $state<"upload" | "existing">("upload");
  let existingImages = $state<BlobFile[]>([]);
  let selectedImages = $state<Set<string>>(new Set());
  let isLoadingImages = $state(false);
  let isUploading = $state(false);
  let uploadError = $state<string | null>(null);

  // Staged images waiting for alt text before confirmation
  let stagedImages = $state<SelectedImage[]>([]);

  // Load existing images when tab switches to "existing"
  async function loadExistingImages() {
    if (existingImages.length > 0) return;

    isLoadingImages = true;
    try {
      const response = await fetch(`/api/assets/list?folder=${folder}`);
      if (response.ok) {
        existingImages = await response.json();
      }
    } catch {
      // Silent fail
    } finally {
      isLoadingImages = false;
    }
  }

  function handleTabChange(tab: "upload" | "existing") {
    activeTab = tab;
    if (tab === "existing") {
      loadExistingImages();
    }
  }

  function toggleImageSelection(url: string) {
    const newSet = new Set(selectedImages);
    if (newSet.has(url)) {
      newSet.delete(url);
    } else {
      newSet.add(url);
    }
    selectedImages = newSet;
  }

  function handleSelectExisting() {
    const selected = existingImages
      .filter((img) => selectedImages.has(img.url))
      .map((img) => ({
        url: img.url,
        name: img.name,
        width: 0,
        height: 0,
        size: img.size,
        alt: ""
      }));

    // Skip alt text review — existing images have alt text in the DB
    onSelect(selected);
    resetAndClose();
  }

  /** Read image dimensions from the browser before uploading */
  function getImageDimensions(file: File): Promise<{ width: number; height: number }> {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        resolve({ width: img.naturalWidth, height: img.naturalHeight });
        URL.revokeObjectURL(img.src);
      };
      img.onerror = () => {
        resolve({ width: 0, height: 0 });
        URL.revokeObjectURL(img.src);
      };
      img.src = URL.createObjectURL(file);
    });
  }

  async function handleFileUpload(event: Event) {
    const input = event.target as HTMLInputElement;
    const files = input.files;
    if (!files || files.length === 0) return;

    isUploading = true;
    uploadError = null;

    try {
      const uploadedFiles: SelectedImage[] = [];

      for (const file of files) {
        // Get dimensions client-side
        const dims = await getImageDimensions(file);

        const formData = new FormData();
        formData.append("file", file);
        formData.append("folder", folder);
        formData.append("width", dims.width.toString());
        formData.append("height", dims.height.toString());

        const uploadResponse = await fetch("/api/assets/upload", {
          method: "POST",
          body: formData
        });

        if (!uploadResponse.ok) {
          const msg = await uploadResponse.json().catch(() => null);
          throw new Error(msg?.message ?? "Upload failed");
        }

        const result = await uploadResponse.json();
        uploadedFiles.push({
          url: result.url,
          name: result.name,
          width: result.width ?? 0,
          height: result.height ?? 0,
          size: result.size ?? 0,
          alt: ""
        });
      }

      // Move to review stage instead of immediately selecting
      stagedImages = uploadedFiles;
    } catch (e) {
      uploadError = e instanceof Error ? e.message : "Upload failed";
    } finally {
      isUploading = false;
      input.value = "";
    }
  }

  function handleConfirmImages() {
    onSelect(stagedImages);
    resetAndClose();
  }

  function handleBackToSelection() {
    stagedImages = [];
  }

  function updateAltText(index: number, alt: string) {
    stagedImages = stagedImages.map((img, i) => (i === index ? { ...img, alt } : img));
  }

  function resetAndClose() {
    stagedImages = [];
    selectedImages = new Set();
    uploadError = null;
    onClose();
  }

  function handleOpenChange(isOpen: boolean) {
    if (!isOpen) {
      resetAndClose();
    }
  }
</script>

<Dialog.Root bind:open onOpenChange={handleOpenChange}>
  <Dialog.Content class="max-w-2xl">
    <Dialog.Header>
      <Dialog.Title>
        {#if stagedImages.length > 0}
          Add Alt Text
        {:else}
          Add Images
        {/if}
      </Dialog.Title>
      <Dialog.Description>
        {#if stagedImages.length > 0}
          Add descriptive alt text for accessibility and SEO
        {:else}
          Upload new images or select from existing ones
        {/if}
      </Dialog.Description>
    </Dialog.Header>

    {#if stagedImages.length > 0}
      <!-- Review Stage: Add alt text -->
      <div class="max-h-[400px] space-y-4 overflow-y-auto py-4">
        {#each stagedImages as image, index}
          <div class="flex gap-4 rounded-lg border border-border p-3">
            <img
              src={imageUrl(image.url, 100)}
              alt={image.name}
              class="h-20 w-20 shrink-0 rounded object-cover"
            />
            <div class="flex-1">
              <p class="mb-2 text-sm font-medium text-foreground-secondary">{image.name}</p>
              <div>
                <Label for="alt-{index}" class="text-xs">Alt text</Label>
                <Input
                  id="alt-{index}"
                  value={image.alt}
                  oninput={(e) => updateAltText(index, e.currentTarget.value)}
                  placeholder="Describe this image..."
                />
              </div>
            </div>
          </div>
        {/each}
      </div>

      <Dialog.Footer>
        <Button variant="outline" onclick={handleBackToSelection}>
          <ArrowLeft class="mr-1.5 h-4 w-4" />
          Back
        </Button>
        <Button onclick={handleConfirmImages}>
          Add {stagedImages.length} Image{stagedImages.length > 1 ? "s" : ""}
        </Button>
      </Dialog.Footer>
    {:else}
      <!-- Selection Stage: Tabs -->
      {#if !uploadOnly}
        <div class="flex border-b border-border" role="tablist">
          <div
            role="tab"
            tabindex="0"
            aria-selected={activeTab === "upload"}
            onclick={() => handleTabChange("upload")}
            onkeydown={(e) => e.key === "Enter" && handleTabChange("upload")}
            class={cn(
              "cursor-pointer px-4 py-2 text-sm font-medium",
              activeTab === "upload"
                ? "border-b-2 border-blue-500 text-blue-600 dark:text-blue-400"
                : "text-muted-foreground hover:text-foreground-secondary"
            )}
          >
            <Upload class="mr-1.5 inline-block h-4 w-4" />
            Upload New
          </div>
          <div
            role="tab"
            tabindex="0"
            aria-selected={activeTab === "existing"}
            onclick={() => handleTabChange("existing")}
            onkeydown={(e) => e.key === "Enter" && handleTabChange("existing")}
            class={cn(
              "cursor-pointer px-4 py-2 text-sm font-medium",
              activeTab === "existing"
                ? "border-b-2 border-blue-500 text-blue-600 dark:text-blue-400"
                : "text-muted-foreground hover:text-foreground-secondary"
            )}
          >
            <ImageIcon class="mr-1.5 inline-block h-4 w-4" />
            Select Existing
          </div>
        </div>
      {/if}

      <!-- Tab Content -->
      <div class="min-h-[300px] py-4">
        {#if activeTab === "upload"}
          <!-- Upload Tab -->
          <div class="flex flex-col items-center justify-center">
            {#if uploadError}
              <p class="mb-4 text-sm text-red-600">{uploadError}</p>
            {/if}

            <label
              class="flex w-full cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-input-border py-12 hover:border-blue-500 hover:bg-hover"
            >
              <input
                type="file"
                accept="image/*"
                multiple
                class="hidden"
                onchange={handleFileUpload}
                disabled={isUploading}
              />
              {#if isUploading}
                <Loader2 class="mb-2 h-10 w-10 animate-spin text-blue-500" />
                <span class="text-sm text-foreground-tertiary">Uploading...</span>
              {:else}
                <Upload class="mb-2 h-10 w-10 text-placeholder" />
                <span class="text-sm font-medium text-foreground-tertiary"
                  >Click to upload images</span
                >
                <span class="mt-1 text-xs text-placeholder">PNG, JPG, WebP up to 10MB each</span>
              {/if}
            </label>
          </div>
        {:else}
          <!-- Existing Images Tab -->
          {#if isLoadingImages}
            <div class="flex items-center justify-center py-12">
              <Loader2 class="h-8 w-8 animate-spin text-placeholder" />
            </div>
          {:else if existingImages.length === 0}
            <div class="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <ImageIcon class="mb-2 h-10 w-10" />
              <p>No existing images found</p>
            </div>
          {:else}
            <div class="grid max-h-[400px] grid-cols-4 gap-3 overflow-y-auto">
              {#each existingImages as image}
                <div
                  role="checkbox"
                  tabindex="0"
                  aria-checked={selectedImages.has(image.url)}
                  onclick={() => toggleImageSelection(image.url)}
                  onkeydown={(e) => e.key === "Enter" && toggleImageSelection(image.url)}
                  class={cn(
                    "group relative aspect-square cursor-pointer overflow-hidden rounded-lg border-2 transition-all",
                    selectedImages.has(image.url)
                      ? "border-blue-500 ring-2 ring-blue-200"
                      : "border-border hover:border-input-border"
                  )}
                >
                  <img
                    src={imageUrl(image.url, 150)}
                    alt={image.name}
                    class="h-full w-full object-cover"
                  />
                  {#if selectedImages.has(image.url)}
                    <div class="absolute inset-0 flex items-center justify-center bg-blue-500/20">
                      <div class="rounded-full bg-blue-500 p-1">
                        <Check class="h-4 w-4 text-white" />
                      </div>
                    </div>
                  {/if}
                </div>
              {/each}
            </div>
          {/if}
        {/if}
      </div>

      <Dialog.Footer>
        <Button variant="outline" onclick={onClose}>Cancel</Button>
        {#if activeTab === "existing" && selectedImages.size > 0}
          <Button onclick={handleSelectExisting}>
            Add {selectedImages.size} Image{selectedImages.size > 1 ? "s" : ""}
          </Button>
        {/if}
      </Dialog.Footer>
    {/if}
  </Dialog.Content>
</Dialog.Root>
