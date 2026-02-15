<script lang="ts">
  import { cn } from "$lib/utils";
  import * as Dialog from "$lib/components/admin/ui/dialog";
  import { Button } from "$lib/components/admin/ui/button";
  import { Input } from "$lib/components/admin/ui/input";
  import { Label } from "$lib/components/admin/ui/label";
  import Upload from "@lucide/svelte/icons/upload";
  import ImageIcon from "@lucide/svelte/icons/image";
  import Check from "@lucide/svelte/icons/check";
  import Loader2 from "@lucide/svelte/icons/loader-2";
  import ArrowLeft from "@lucide/svelte/icons/arrow-left";

  interface ImageKitFile {
    fileId: string;
    name: string;
    url: string;
    thumbnail: string;
    width: number;
    height: number;
    size: number;
  }

  interface SelectedImage {
    url: string;
    name: string;
    fileId: string;
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
  }

  let { open = $bindable(), onClose, onSelect, folder = "/products" }: Props = $props();

  let activeTab = $state<"upload" | "existing">("upload");
  let existingImages = $state<ImageKitFile[]>([]);
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

  function toggleImageSelection(fileId: string) {
    const newSet = new Set(selectedImages);
    if (newSet.has(fileId)) {
      newSet.delete(fileId);
    } else {
      newSet.add(fileId);
    }
    selectedImages = newSet;
  }

  function handleSelectExisting() {
    const selected = existingImages
      .filter((img) => selectedImages.has(img.fileId))
      .map((img) => ({
        url: img.url,
        name: img.name,
        fileId: img.fileId,
        width: img.width,
        height: img.height,
        size: img.size,
        alt: ""
      }));

    // Move to review stage
    stagedImages = selected;
  }

  async function handleFileUpload(event: Event) {
    const input = event.target as HTMLInputElement;
    const files = input.files;
    if (!files || files.length === 0) return;

    isUploading = true;
    uploadError = null;

    try {
      // Get auth params from server
      const authResponse = await fetch("/api/assets/auth");
      const auth = await authResponse.json();

      const uploadedFiles: SelectedImage[] = [];

      // Upload each file to ImageKit
      for (const file of files) {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("publicKey", auth.publicKey);
        formData.append("signature", auth.signature);
        formData.append("expire", auth.expire.toString());
        formData.append("token", auth.token);
        formData.append("fileName", file.name);
        formData.append("folder", folder);

        const uploadResponse = await fetch("https://upload.imagekit.io/api/v1/files/upload", {
          method: "POST",
          body: formData
        });

        if (!uploadResponse.ok) {
          throw new Error("Upload failed");
        }

        const result = await uploadResponse.json();
        uploadedFiles.push({
          url: result.url,
          name: result.name,
          fileId: result.fileId,
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
              src="{image.url}?tr=w-100,h-100,fo-auto"
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
                  aria-checked={selectedImages.has(image.fileId)}
                  onclick={() => toggleImageSelection(image.fileId)}
                  onkeydown={(e) => e.key === "Enter" && toggleImageSelection(image.fileId)}
                  class={cn(
                    "group relative aspect-square cursor-pointer overflow-hidden rounded-lg border-2 transition-all",
                    selectedImages.has(image.fileId)
                      ? "border-blue-500 ring-2 ring-blue-200"
                      : "border-border hover:border-input-border"
                  )}
                >
                  <img
                    src="{image.url}?tr=w-150,h-150,fo-auto"
                    alt={image.name}
                    class="h-full w-full object-cover"
                  />
                  {#if selectedImages.has(image.fileId)}
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
          <Button onclick={handleSelectExisting}>Next: Add Alt Text</Button>
        {/if}
      </Dialog.Footer>
    {/if}
  </Dialog.Content>
</Dialog.Root>
