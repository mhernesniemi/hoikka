<script lang="ts">
  import { enhance } from "$app/forms";
  import { toast } from "svelte-sonner";
  import { Button } from "$lib/components/admin/ui/button";
  import { Input } from "$lib/components/admin/ui/input";
  import { Label } from "$lib/components/admin/ui/label";
  import AdminCard from "$lib/components/admin/AdminCard.svelte";
  import TranslationEditor from "$lib/components/admin/TranslationEditor.svelte";
  import DeleteConfirmDialog from "$lib/components/admin/DeleteConfirmDialog.svelte";
  import { translationsToMap, TRANSLATION_LANGUAGES } from "$lib/config/languages.js";
  import { imageUrl } from "$lib/image";
  import { formatFileSize } from "$lib/utils";
  import ChevronLeft from "@lucide/svelte/icons/chevron-left";
  import type { ActionData, PageData } from "./$types";

  let { data, form }: { data: PageData; form: ActionData } = $props();

  let isSubmitting = $state(false);
  let showDelete = $state(false);

  let name = $state("");
  let alt = $state("");

  const translationMap = $derived(translationsToMap(data.translations));

  $effect(() => {
    name = data.asset.name;
    alt = data.asset.alt ?? "";
  });

  $effect(() => {
    if (form?.error) toast.error(form.error);
  });
</script>

<svelte:head><title>{name || "Edit Asset"} | Admin</title></svelte:head>

<div class="space-y-6">
  <div class="mb-6 flex items-center justify-between">
    <a
      href="/admin/assets"
      class="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline dark:text-blue-400"
    >
      <ChevronLeft class="h-4 w-4" /> Back to Assets
    </a>
    <Button type="submit" form="asset-form" disabled={isSubmitting}>
      {isSubmitting ? "Saving..." : "Save Changes"}
    </Button>
  </div>

  <h1 class="text-2xl font-bold">{name || "Edit Asset"}</h1>

  <!-- Two Column Layout -->
  <div class="flex flex-col gap-6 lg:flex-row">
    <!-- Main Content (Left) -->
    <div class="flex-1 space-y-6">
      <!-- Image Preview -->
      <div class="overflow-hidden rounded-lg bg-surface shadow">
        <div class="flex items-center justify-center bg-muted p-4">
          <img
            src={imageUrl(data.asset.source, 800)}
            alt={alt || name}
            class="max-h-[500px] rounded object-contain"
          />
        </div>
      </div>

      <!-- Details Card -->
      <form
        id="asset-form"
        method="POST"
        action="?/update"
        use:enhance={() => {
          isSubmitting = true;
          return async ({ result, update }) => {
            await update({ reset: false });
            isSubmitting = false;
            if (result.type === "success") {
              toast.success("Asset updated");
            }
          };
        }}
      >
        <AdminCard title="Details">
          <div class="space-y-4">
            <div>
              <Label for="name">Name <span class="text-red-500">*</span></Label>
              <Input type="text" id="name" name="name" bind:value={name} required />
            </div>

            <div>
              <Label for="alt">Alt text</Label>
              <Input
                type="text"
                id="alt"
                name="alt"
                bind:value={alt}
                placeholder="Describe this image..."
              />
              <p class="mt-1 text-xs text-muted-foreground">
                Describes the image for screen readers and search engines.
              </p>
            </div>
          </div>
        </AdminCard>
      </form>

      <!-- Translations -->
      {#if TRANSLATION_LANGUAGES.length > 0}
        <TranslationEditor
          fields={[{ name: "alt", label: "Alt text", type: "text" }]}
          translations={translationMap}
          formId="asset-form"
        />
      {/if}

      <button
        type="button"
        class="text-sm text-red-600 hover:text-red-800 dark:text-red-700"
        onclick={() => (showDelete = true)}
      >
        Delete this asset
      </button>
    </div>

    <!-- Sidebar (Right) -->
    <div class="w-full space-y-6 lg:w-80 lg:shrink-0">
      <AdminCard title="File Info" variant="sidebar">
        <dl class="space-y-3 text-sm">
          {#if data.asset.width && data.asset.height}
            <div>
              <dt class="text-muted-foreground">Dimensions</dt>
              <dd>{data.asset.width} &times; {data.asset.height}</dd>
            </div>
          {/if}
          {#if data.asset.fileSize}
            <div>
              <dt class="text-muted-foreground">File size</dt>
              <dd>{formatFileSize(data.asset.fileSize)}</dd>
            </div>
          {/if}
          <div>
            <dt class="text-muted-foreground">Type</dt>
            <dd>{data.asset.mimeType}</dd>
          </div>
          <div>
            <dt class="text-muted-foreground">Source URL</dt>
            <dd class="break-all">
              <a
                href={data.asset.source}
                target="_blank"
                rel="noopener noreferrer"
                class="text-blue-600 hover:underline dark:text-blue-400"
              >
                {data.asset.source}
              </a>
            </dd>
          </div>
        </dl>
      </AdminCard>
    </div>
  </div>
</div>

<DeleteConfirmDialog
  bind:open={showDelete}
  title="Delete Asset?"
  description="Are you sure you want to delete this asset? This will also remove it from any products using it. This action cannot be undone."
/>
