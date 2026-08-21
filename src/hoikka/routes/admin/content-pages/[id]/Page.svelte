<script lang="ts">
  import hoikkaConfig from "$hoikka/config";
  import FieldRenderer from "@hoikka/core/admin/FieldRenderer.svelte";
  import { SelectNative } from "@hoikka/core/admin/ui/select-native/index";
  import { enhance } from "$app/forms";
  import { page } from "$app/state";
  import { toast } from "svelte-sonner";
  import { Button } from "@hoikka/core/admin/ui/button/index";
  import { Checkbox } from "@hoikka/core/admin/ui/checkbox/index";
  import { Input } from "@hoikka/core/admin/ui/input/index";
  import { Label } from "@hoikka/core/admin/ui/label/index";
  import { RichTextEditor } from "@hoikka/core/admin/ui/rich-text-editor/index";
  import AdminCard from "@hoikka/core/admin/AdminCard.svelte";
  import DeleteConfirmDialog from "@hoikka/core/admin/DeleteConfirmDialog.svelte";
  import {
    translationsToMap,
    LANGUAGES,
    DEFAULT_LANGUAGE,
    TRANSLATION_LANGUAGES
  } from "@hoikka/core/config/derived";
  import { cn } from "@hoikka/core/shared/utils";
  import { imageUrl as imgUrl } from "@hoikka/core/shared/image";
  import UnsavedChangesDialog from "@hoikka/core/admin/UnsavedChangesDialog.svelte";
  import { onMount } from "svelte";
  import ImagePicker from "@hoikka/core/admin/ImagePicker.svelte";
  import Plus from "@lucide/svelte/icons/plus";
  import Trash2 from "@lucide/svelte/icons/trash-2";
  import ChevronLeft from "@lucide/svelte/icons/chevron-left";
  import ExternalLink from "@lucide/svelte/icons/external-link";
  let { data, form } = $props();

  let showCancelDelete = $state(false);

  onMount(() => {
    if (page.url.searchParams.has("created")) {
      showCancelDelete = true;
      history.replaceState({}, "", page.url.pathname);
    }
  });

  $effect(() => {
    if (form?.error) toast.error(form.error);
  });

  let isSubmitting = $state(false);
  let showDelete = $state(false);

  let title = $state("");
  let slug = $state("");
  let published = $state(false);
  let template = $state(data.page.template ?? "default");
  const templateFieldDefs = $derived(hoikkaConfig.contentPages.templates[template]?.fields ?? []);
  let body = $state("");
  let imageUrl = $state<string | null>(null);
  let showImagePicker = $state(false);
  let activeLanguageTab = $state(DEFAULT_LANGUAGE);
  const translationMap = $derived(translationsToMap(data.translations));

  $effect(() => {
    title = data.page.title ?? "";
    slug = data.page.slug ?? "";
    published = data.page.published;
    body = data.page.body ?? "";
    imageUrl = data.page.imageUrl ?? null;
  });

  const hasUnsavedChanges = $derived.by(() => {
    return (
      title !== (data.page.title ?? "") ||
      slug !== (data.page.slug ?? "") ||
      body !== (data.page.body ?? "") ||
      published !== data.page.published ||
      imageUrl !== (data.page.imageUrl ?? null)
    );
  });

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
    }
  }
</script>

<svelte:head><title>{title || "Edit Content Page"} | Admin</title></svelte:head>

<div class="space-y-6">
  <div class="mb-6 flex items-center justify-between">
    <a
      href="/admin/content-pages"
      class="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline dark:text-blue-400"
      ><ChevronLeft class="h-4 w-4" /> Back to Pages</a
    >
    <a
      href="/pages/{data.page.id}/{slug}{data.page.published ? '' : '?preview'}"
      target="_blank"
      class="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline dark:text-blue-400"
    >
      Preview <ExternalLink class="h-3.5 w-3.5" />
    </a>
  </div>
  <div class="mt-2 flex items-center justify-between">
    <h1 class="text-2xl font-bold">{title || "Edit Content Page"}</h1>
    <div class="flex items-center gap-2">
      {#if showCancelDelete}
        <form method="POST" action="?/delete" use:enhance>
          <Button type="submit" variant="outline">Cancel</Button>
        </form>
      {/if}
      <Button type="submit" form="content-page-form" disabled={isSubmitting}>
        {isSubmitting ? "Saving..." : "Save Changes"}
      </Button>
    </div>
  </div>

  <!-- Two Column Layout -->
  <div class="flex flex-col gap-6 lg:flex-row">
    <!-- Main Content (Left) -->
    <div class="flex-1 space-y-6">
      <form
        id="content-page-form"
        method="POST"
        action="?/update"
        use:enhance={() => {
          isSubmitting = true;
          return async ({ result, update }) => {
            await update({ reset: false });
            isSubmitting = false;
            if (result.type === "success") {
              showCancelDelete = false;
              toast.success("Page updated");
            }
          };
        }}
        class="space-y-6"
      >
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
                  <Label for="title">Title <span class="text-red-500">*</span></Label>
                  <Input type="text" id="title" name="title" bind:value={title} required />
                </div>

                <div>
                  <Label for="slug">Slug <span class="text-red-500">*</span></Label>
                  <Input type="text" id="slug" name="slug" bind:value={slug} required />
                </div>
              </div>

              <div>
                <Label for="body">Body</Label>
                <RichTextEditor
                  name="body"
                  content={data.page.body ?? ""}
                  placeholder="Write page content..."
                  onchange={(html) => (body = html)}
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
                    <Label for="translation_{lang.code}_title">Title</Label>
                    <Input
                      type="text"
                      id="translation_{lang.code}_title"
                      name="title_{lang.code}"
                      value={translationMap[lang.code]?.title ?? ""}
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
                  <Label for="translation_{lang.code}_body">Body</Label>
                  <RichTextEditor
                    name="body_{lang.code}"
                    content={translationMap[lang.code]?.body ?? ""}
                    placeholder="Write page content..."
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

      <button
        type="button"
        class="text-sm text-red-600 hover:text-red-800 dark:text-red-700"
        onclick={() => (showDelete = true)}
      >
        Delete this page
      </button>
    </div>

    <!-- Sidebar (Right) -->
    <div class="w-full space-y-6 lg:w-80 lg:shrink-0">
      {#if Object.keys(hoikkaConfig.contentPages.templates).length > 1 || templateFieldDefs.length > 0}
        <AdminCard title="Template" variant="sidebar">
          <SelectNative name="template" form="content-page-form" bind:value={template}>
            {#each Object.entries(hoikkaConfig.contentPages.templates) as [key, def] (key)}
              <option value={key}>{def.label}</option>
            {/each}
          </SelectNative>
          {#if templateFieldDefs.length > 0}
            <div class="mt-4 space-y-4">
              <FieldRenderer
                defs={templateFieldDefs}
                values={data.page.customFields ?? {}}
                formId="content-page-form"
              />
            </div>
          {/if}
        </AdminCard>
      {/if}

      <AdminCard title="Visibility" variant="sidebar">
        <div class="flex items-center gap-2">
          <Checkbox id="published" bind:checked={published} />
          {#if published}
            <input type="hidden" name="published" value="on" form="content-page-form" />
          {/if}
          <label for="published" class="text-sm font-medium text-foreground-secondary">
            Published
          </label>
        </div>
        <p class="mt-3 text-xs text-muted-foreground">
          Set this to published to make it visible on the storefront
        </p>
      </AdminCard>

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
              alt={title}
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
        <input type="hidden" name="imageUrl" value={imageUrl ?? ""} form="content-page-form" />
      </AdminCard>
    </div>
  </div>
</div>

<UnsavedChangesDialog isDirty={() => hasUnsavedChanges} isSaving={() => isSubmitting} />

<ImagePicker
  bind:open={showImagePicker}
  onClose={() => (showImagePicker = false)}
  onSelect={handleImageSelected}
  folder="/pages"
/>

<DeleteConfirmDialog
  bind:open={showDelete}
  title="Delete Page?"
  description="Are you sure you want to delete this page? This action cannot be undone."
/>
