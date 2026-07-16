<script lang="ts">
  import { enhance } from "$app/forms";
  import { page } from "$app/state";
  import { onMount } from "svelte";
  import { toast } from "svelte-sonner";
  import { Button } from "$lib/components/admin/ui/button";
  import { Badge } from "$lib/components/admin/ui/badge";
  import { Input } from "$lib/components/admin/ui/input";
  import { Label } from "$lib/components/admin/ui/label";
  import * as Dialog from "$lib/components/admin/ui/dialog";
  import AdminCard from "$lib/components/admin/AdminCard.svelte";
  import { Checkbox } from "$lib/components/admin/ui/checkbox";
  import DeleteConfirmDialog from "$lib/components/admin/DeleteConfirmDialog.svelte";
  import CreateDialog from "$lib/components/admin/CreateDialog.svelte";
  import TranslationEditor from "$lib/components/admin/TranslationEditor.svelte";
  import { translationsToMap, TRANSLATION_LANGUAGES } from "$lib/config/languages.js";
  import { slugify } from "$lib/utils";
  import UnsavedChangesDialog from "$lib/components/admin/UnsavedChangesDialog.svelte";
  import IconButton from "$lib/components/admin/IconButton.svelte";
  import Plus from "@lucide/svelte/icons/plus";
  import Pencil from "@lucide/svelte/icons/pencil";
  import Trash2 from "@lucide/svelte/icons/trash-2";
  import ChevronLeft from "@lucide/svelte/icons/chevron-left";
  import type { PageData, ActionData } from "./$types";

  let { data, form }: { data: PageData; form: ActionData } = $props();

  let isSubmitting = $state(false);
  let showDelete = $state(false);
  let cameFromCreate = $state(false);
  let showCancelDelete = $state(false);
  let hasSaved = $state(false);
  let createDialogOpen = $state(false);

  type ValueEntry = {
    id: number | null;
    name: string;
    code: string;
    translations: Record<string, string>;
  };

  let facetName = $state("");
  let facetCode = $state("");
  let facetIsHidden = $state(false);
  let values = $state<ValueEntry[]>([]);
  let valuesJson = $derived(JSON.stringify(values));

  // Bulk add input
  let bulkInput = $state("");
  let bulkInputEl = $state<HTMLInputElement | null>(null);

  // Edit value dialog
  let editDialogOpen = $state(false);
  let editingIndex = $state<number | null>(null);
  let editName = $state("");
  let editCode = $state("");
  let editCodeManual = $state(false);
  let editTranslations = $state<Record<string, string>>({});

  $effect(() => {
    facetName = data.facet.name ?? "";
    facetCode = data.facet.code;
    facetIsHidden = data.facet.isHidden;
    values = data.facet.values
      .map((v) => ({
        id: v.id,
        name: v.name ?? "",
        code: v.code,
        translations: Object.fromEntries(
          TRANSLATION_LANGUAGES.map((lang) => {
            const t = data.valueTranslations[v.id]?.find((t) => t.languageCode === lang.code);
            return [lang.code, t?.name ?? ""];
          })
        )
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  });

  const originalValuesJson = $derived(
    JSON.stringify(
      data.facet.values
        .map((v) => ({
          id: v.id,
          name: v.name ?? "",
          code: v.code,
          translations: Object.fromEntries(
            TRANSLATION_LANGUAGES.map((lang) => {
              const t = data.valueTranslations[v.id]?.find((t) => t.languageCode === lang.code);
              return [lang.code, t?.name ?? ""];
            })
          )
        }))
        .sort((a, b) => a.name.localeCompare(b.name))
    )
  );

  const hasUnsavedChanges = $derived.by(() => {
    return (
      facetName !== (data.facet.name ?? "") ||
      facetCode !== data.facet.code ||
      facetIsHidden !== data.facet.isHidden ||
      JSON.stringify(values) !== originalValuesJson
    );
  });

  onMount(() => {
    if (page.url.searchParams.has("created")) {
      cameFromCreate = true;
      showCancelDelete = true;
      history.replaceState({}, "", page.url.pathname);
      requestAnimationFrame(() => bulkInputEl?.focus());
    }
  });

  $effect(() => {
    if (form?.error) toast.error(form.error);
  });

  function addBulkValues() {
    const names = bulkInput
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (names.length === 0) return;

    const newValues: ValueEntry[] = names.map((name) => ({
      id: null,
      name,
      code: slugify(name),
      translations: Object.fromEntries(TRANSLATION_LANGUAGES.map((l) => [l.code, ""]))
    }));

    values = [...values, ...newValues].sort((a, b) => a.name.localeCompare(b.name));
    bulkInput = "";
  }

  function handleBulkKeydown(e: KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      addBulkValues();
    }
  }

  function openEditDialog(index: number) {
    editingIndex = index;
    editName = values[index].name;
    editCode = values[index].code;
    editCodeManual = !!values[index].id;
    editTranslations = { ...values[index].translations };
    editDialogOpen = true;
  }

  function handleEditNameInput(e: Event) {
    editName = (e.target as HTMLInputElement).value;
    if (!editCodeManual) {
      editCode = slugify(editName);
    }
  }

  function handleEditCodeInput(e: Event) {
    editCode = (e.target as HTMLInputElement).value;
    editCodeManual = true;
  }

  const canSaveEdit = $derived(editName.trim() !== "" && editCode.trim() !== "");

  function saveEdit() {
    if (editingIndex === null || !canSaveEdit) return;
    values[editingIndex] = {
      ...values[editingIndex],
      name: editName,
      code: editCode,
      translations: { ...editTranslations }
    };
    editDialogOpen = false;
  }

  function removeValue(index: number) {
    values = values.filter((_, j) => j !== index);
  }
</script>

<svelte:head><title>{data.facet.name} | Facets | Admin</title></svelte:head>

<div class="space-y-6">
  <div class="mb-6 flex items-center justify-between">
    <a
      href="/admin/facets"
      class="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline dark:text-blue-400"
      ><ChevronLeft class="h-4 w-4" /> Back to Facets</a
    >
  </div>
  <div class="flex items-center justify-between">
    <h1 class="text-2xl font-bold">{data.facet.name}</h1>
    <div class="flex items-center gap-2">
      {#if cameFromCreate && hasSaved}
        <Button type="button" variant="outline" onclick={() => (createDialogOpen = true)}>
          <Plus class="h-4 w-4" /> Add Facet
        </Button>
      {/if}
      {#if showCancelDelete}
        <form method="POST" action="?/delete" use:enhance>
          <Button type="submit" variant="outline">Cancel</Button>
        </form>
      {/if}
      <Button type="submit" form="facet-form" disabled={isSubmitting}>
        {isSubmitting ? "Saving..." : "Save Changes"}
      </Button>
    </div>
  </div>

  <!-- Two Column Layout -->
  <div class="flex flex-col gap-6 lg:flex-row">
    <!-- Main Content (Left) -->
    <div class="flex-1 space-y-6">
      <!-- Edit Facet -->
      <form
        id="facet-form"
        method="POST"
        action="?/update"
        use:enhance={({ cancel }) => {
          if (!facetName.trim() || !facetCode.trim()) {
            cancel();
            toast.error("Facet name and code are required");
            return;
          }
          const invalidValues = values
            .filter((v) => v.name.trim() || v.code.trim())
            .filter((v) => !v.name.trim() || !v.code.trim());
          if (invalidValues.length > 0) {
            cancel();
            toast.error("All values must have both name and code");
            return;
          }
          isSubmitting = true;
          return async ({ result, update }) => {
            await update({ reset: false });
            isSubmitting = false;
            if (result.type === "success") {
              hasSaved = true;
              showCancelDelete = false;
              toast.success("Facet updated");
            }
          };
        }}
      >
        <input type="hidden" name="values_json" value={valuesJson} />
        <input type="hidden" name="is_hidden" value={facetIsHidden ? "on" : ""} />
        <AdminCard title="Facet Details">
          <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label for="facet_name">Name <span class="text-red-500">*</span></Label>
              <Input type="text" id="facet_name" name="name" required bind:value={facetName} />
            </div>
            <div>
              <Label for="facet_code">Code <span class="text-red-500">*</span></Label>
              <Input type="text" id="facet_code" name="code" required bind:value={facetCode} />
            </div>
          </div>
        </AdminCard>
      </form>

      <!-- Values -->
      <AdminCard title="Values" noPadding noBorder>
        {#snippet headerExtra()}
          <div class="border-b border-border px-6 py-4">
            <p class="text-sm text-foreground-tertiary">
              Add one or more values. Separate multiple with commas.
            </p>
            <div class="mt-3 flex gap-2">
              <input
                type="text"
                id="bulk-values"
                bind:this={bulkInputEl}
                bind:value={bulkInput}
                onkeydown={handleBulkKeydown}
                placeholder="e.g., Red, Blue, Yellow"
                class="w-full rounded-lg border border-input-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-placeholder hover:border-foreground/20"
              />
              <Button type="button" variant="outline" onclick={addBulkValues} class="shrink-0">
                Add
              </Button>
            </div>
          </div>
        {/snippet}
        {#if values.length === 0}
          <div class="p-12 text-center">
            <p class="text-sm text-muted-foreground">
              No values yet. Add values to use this facet for filtering.
            </p>
          </div>
        {:else}
          <div>
            {#each values as value, i}
              {@const translatedLangs = TRANSLATION_LANGUAGES.filter(
                (lang) => value.translations[lang.code]
              )}
              <div
                class="flex items-center border-b border-border px-6 py-2.5 last:border-b-0 hover:bg-hover"
              >
                <div class="flex min-w-0 flex-1 items-center gap-3">
                  <span class="text-sm font-medium">{value.name}</span>
                  <span class="text-sm text-placeholder">{value.code}</span>
                  <span class="ml-auto flex shrink-0 items-center gap-3">
                    <span class="flex items-center gap-1.5">
                      {#each translatedLangs as lang}
                        <Badge variant="outline">{lang.code.toUpperCase()}</Badge>
                      {/each}
                    </span>
                  </span>
                </div>
                <div class="flex shrink-0 items-center gap-1 pl-4">
                  <IconButton
                    icon={Pencil}
                    tooltip="Edit value"
                    size="sm"
                    onclick={() => openEditDialog(i)}
                  />
                  <IconButton
                    icon={Trash2}
                    tooltip="Remove value"
                    size="sm"
                    variant="danger"
                    onclick={() => removeValue(i)}
                  />
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </AdminCard>

      <button
        type="button"
        class="text-sm text-red-600 hover:text-red-800 dark:text-red-700"
        onclick={() => (showDelete = true)}
      >
        Delete this facet
      </button>
    </div>

    <!-- Sidebar (Right) -->
    <div class="w-full space-y-6 lg:w-80 lg:shrink-0">
      <AdminCard title="Visibility">
        <div class="flex items-center gap-2">
          <Checkbox id="is_hidden" bind:checked={facetIsHidden} />
          <label for="is_hidden" class="text-sm font-medium text-foreground-secondary">
            Hidden from storefront filters
          </label>
        </div>
      </AdminCard>
      {#if TRANSLATION_LANGUAGES.length > 0}
        <TranslationEditor
          fields={[{ name: "name", label: "Name", type: "text" }]}
          translations={translationsToMap(data.facetTranslations)}
          formId="facet-form"
        />
      {/if}
    </div>
  </div>
</div>

<!-- Edit Value Dialog -->
<Dialog.Root bind:open={editDialogOpen}>
  <Dialog.Content>
    <Dialog.Header>
      <Dialog.Title>Edit Value</Dialog.Title>
      <Dialog.Description>Update the value details.</Dialog.Description>
    </Dialog.Header>
    <form
      onsubmit={(e) => {
        e.preventDefault();
        saveEdit();
      }}
    >
      <div class="my-4 grid grid-cols-2 gap-4">
        <div>
          <Label for="edit_value_name">Name <span class="text-red-500">*</span></Label>
          <Input
            type="text"
            id="edit_value_name"
            value={editName}
            oninput={handleEditNameInput}
            placeholder="e.g., Red"
          />
        </div>
        <div>
          <Label for="edit_value_code">Code <span class="text-red-500">*</span></Label>
          <Input
            type="text"
            id="edit_value_code"
            value={editCode}
            oninput={handleEditCodeInput}
            placeholder="e.g., red"
          />
        </div>
        {#each TRANSLATION_LANGUAGES as lang}
          <div class="col-span-2">
            <Label for="edit_value_name_{lang.code}">{lang.name} name</Label>
            <Input
              type="text"
              id="edit_value_name_{lang.code}"
              bind:value={editTranslations[lang.code]}
              placeholder={editName}
            />
          </div>
        {/each}
      </div>
      <Dialog.Footer>
        <Button type="button" variant="outline" onclick={() => (editDialogOpen = false)}>
          Cancel
        </Button>
        <Button type="submit" disabled={!canSaveEdit}>Save</Button>
      </Dialog.Footer>
    </form>
  </Dialog.Content>
</Dialog.Root>

<CreateDialog
  bind:open={createDialogOpen}
  title="New Facet"
  action="/admin/facets?/create"
  placeholder="e.g., Color"
  fieldName="name"
  slugField="code"
/>

<UnsavedChangesDialog isDirty={() => hasUnsavedChanges} isSaving={() => isSubmitting} />

<DeleteConfirmDialog
  bind:open={showDelete}
  title="Delete Facet?"
  description="Are you sure you want to delete this facet and all its values? This action cannot be undone."
/>
