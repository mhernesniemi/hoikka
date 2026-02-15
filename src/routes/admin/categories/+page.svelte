<script lang="ts">
  import { enhance } from "$app/forms";
  import { browser } from "$app/environment";
  import { untrack } from "svelte";
  import { toast } from "svelte-sonner";
  import { Button } from "$lib/components/admin/ui/button";
  import { Badge } from "$lib/components/admin/ui/badge";
  import { Input } from "$lib/components/admin/ui/input";
  import { Label } from "$lib/components/admin/ui/label";
  import { SelectNative } from "$lib/components/admin/ui/select-native";
  import * as Dialog from "$lib/components/admin/ui/dialog";
  import * as Collapsible from "$lib/components/admin/ui/collapsible";
  import { TRANSLATION_LANGUAGES } from "$lib/config/languages.js";
  import IconButton from "$lib/components/admin/IconButton.svelte";
  import CategoryCombobox from "$lib/components/admin/CategoryCombobox.svelte";
  import { slugify, cn } from "$lib/utils.js";
  import DeleteConfirmDialog from "$lib/components/admin/DeleteConfirmDialog.svelte";
  import ChevronRight from "@lucide/svelte/icons/chevron-right";
  import Pencil from "@lucide/svelte/icons/pencil";
  import PlusIcon from "@lucide/svelte/icons/plus";
  import Trash2 from "@lucide/svelte/icons/trash-2";
  import type { PageData } from "./$types";

  let { data, form }: { data: PageData; form: any } = $props();

  $effect(() => {
    if (form?.error) toast.error(form.error);
  });

  type CategoryNode = (typeof data.tree)[0];
  type FlatCategory = { id: number; name: string; depth: number };

  function flattenTree(nodes: CategoryNode[], depth = 0): FlatCategory[] {
    return nodes.flatMap((node) => [
      { id: node.id, name: node.name, depth },
      ...flattenTree(node.children, depth + 1)
    ]);
  }

  function collectIds(nodes: CategoryNode[]): number[] {
    return nodes.flatMap((node) => [node.id, ...collectIds(node.children)]);
  }

  const STORAGE_KEY = "admin:categories:expanded";

  function loadExpandedIds(): Set<number> {
    if (browser) {
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) return new Set(JSON.parse(stored));
      } catch {}
    }
    return new Set(collectIds(data.tree));
  }

  function saveExpandedIds(ids: Set<number>) {
    if (browser) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]));
    }
  }

  const flatCategories = $derived(flattenTree(data.tree));
  let expandedIds = $state(loadExpandedIds());
  const allIds = $derived(collectIds(data.tree));
  const allExpanded = $derived(allIds.length > 0 && allIds.every((id) => expandedIds.has(id)));

  // Inline quick-add state
  let inlineNames = $state("");
  let inlineParentId = $state("");
  let inlineTaxCode = $state("standard");

  // Dialog state
  let createDialogOpen = $state(false);
  let editDialogOpen = $state(false);
  let editingCategory = $state<CategoryNode | null>(null);
  let createParentId = $state<number | null>(null);
  let showDeleteConfirm = $state(false);
  let deletingCategory = $state<CategoryNode | null>(null);

  function countDescendants(node: CategoryNode): number {
    return node.children.reduce((sum, child) => sum + 1 + countDescendants(child), 0);
  }

  function requestDelete(node: CategoryNode) {
    deletingCategory = node;
    showDeleteConfirm = true;
  }

  // Auto-slug for create dialog
  let createName = $state("");
  let createSlug = $state("");
  let createSlugManual = $state(false);

  function openCreateDialog(parentId: number | null = null) {
    createParentId = parentId;
    createName = "";
    createSlug = "";
    createSlugManual = false;
    createDialogOpen = true;
  }

  function openEditDialog(node: CategoryNode) {
    editingCategory = node;
    editDialogOpen = true;
  }

  function toggleExpand(id: number) {
    const next = new Set(expandedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    expandedIds = next;
    saveExpandedIds(next);
  }

  function toggleAll() {
    if (allExpanded) {
      expandedIds = new Set();
    } else {
      expandedIds = new Set(allIds);
    }
    saveExpandedIds(expandedIds);
  }

  function handleCreateNameInput(e: Event) {
    const value = (e.target as HTMLInputElement).value;
    createName = value;
    if (!createSlugManual) {
      createSlug = slugify(value);
    }
  }

  function handleCreateSlugInput(e: Event) {
    createSlug = (e.target as HTMLInputElement).value;
    createSlugManual = true;
  }

  // When tree data changes (create/update/delete), expand any new nodes
  let prevIds = new Set(collectIds(data.tree));
  $effect(() => {
    const currentIds = collectIds(data.tree);
    untrack(() => {
      const newIds = currentIds.filter((id) => !prevIds.has(id));
      if (newIds.length > 0) {
        const next = new Set(expandedIds);
        for (const id of newIds) next.add(id);
        expandedIds = next;
        saveExpandedIds(next);
      }
      prevIds = new Set(currentIds);
    });
  });

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "c" && !e.metaKey && !e.ctrlKey && !createDialogOpen && !editDialogOpen) {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      e.preventDefault();
      openCreateDialog();
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<svelte:head><title>Categories | Admin</title></svelte:head>

<div>
  <h1 class="text-2xl leading-[40px] font-bold">Categories</h1>

  {#if data.tree.some((node) => node.children.length > 0)}
    <div class="mb-2 flex justify-end">
      <button
        type="button"
        class="text-sm text-foreground-secondary hover:text-foreground"
        onclick={toggleAll}
      >
        {allExpanded ? "Collapse all" : "Expand all"}
      </button>
    </div>
  {:else}
    <!-- Spacer -->
    <div class="mb-2 h-[20px]"></div>
  {/if}

  <!-- Category tree -->
  <div class="overflow-hidden rounded-lg border border-border bg-surface">
    <div class="px-6 py-4">
      <p class="text-sm text-foreground-tertiary">
        Add one or more categories. Separate multiple with commas.
      </p>
      <form
        method="POST"
        action="?/quickCreate"
        use:enhance={() => {
          return async ({ update }) => {
            await update();
            inlineNames = "";
            inlineParentId = "";
            inlineTaxCode = "standard";
          };
        }}
        class="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto_auto_auto]"
      >
        <Input
          type="text"
          name="names"
          bind:value={inlineNames}
          placeholder="e.g., Electronics, Clothing, Books"
        />
        <input type="hidden" name="parent_id" value={inlineParentId} />
        <CategoryCombobox
          categories={flatCategories}
          value={inlineParentId}
          onchange={(v) => (inlineParentId = v)}
          triggerClass="sm:w-48"
        />
        <SelectNative
          name="tax_code"
          class="w-full hover:border-input-border hover:bg-hover sm:w-48"
          bind:value={inlineTaxCode}
        >
          {#each data.taxRates as rate}
            <option value={rate.code}>{rate.name}</option>
          {/each}
        </SelectNative>
        <Button type="submit" variant="secondary">Add</Button>
      </form>
    </div>
    {#snippet categoryNode(node: CategoryNode, depth: number, parentPath: string)}
      {@const fullPath = `${parentPath}/${node.slug}`}
      {@const hasChildren = node.children.length > 0}
      {@const isExpanded = expandedIds.has(node.id)}
      {@const taxRate = data.taxRates.find((r) => r.code === node.taxCode)}
      {@const translations = data.categoryTranslations[node.id]}
      {@const translatedLangs = TRANSLATION_LANGUAGES.filter((lang) =>
        translations?.find((t) => t.languageCode === lang.code && t.name)
      )}

      <Collapsible.Root open={isExpanded}>
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
          class={cn(
            "flex w-full items-center border-t border-border",
            "hover:bg-hover",
            hasChildren && "cursor-pointer"
          )}
          style="padding-left: {depth * 1.5 + 0.5}rem"
          onclick={() => {
            if (hasChildren) toggleExpand(node.id);
          }}
        >
          <!-- Chevron toggle -->
          <button
            type="button"
            class={cn(
              "flex h-8 w-8 shrink-0 items-center justify-center rounded-md",
              hasChildren ? "cursor-pointer hover:bg-muted" : "cursor-default"
            )}
            onclick={(e) => {
              e.stopPropagation();
              if (hasChildren) toggleExpand(node.id);
            }}
            tabindex={hasChildren ? 0 : -1}
          >
            {#if hasChildren}
              <ChevronRight
                class={cn(
                  "h-4 w-4 text-muted-foreground transition-transform duration-200",
                  isExpanded && "rotate-90"
                )}
              />
            {/if}
          </button>

          <!-- Row content -->
          <div class="flex min-w-0 flex-1 items-center gap-3 py-2.5 pr-4">
            <span class="text-sm font-medium">{node.name}</span>
            <span class="truncate text-sm text-placeholder">{fullPath}</span>
            <span class="ml-auto flex shrink-0 items-center gap-3">
              <span class="flex items-center gap-1.5">
                {#each translatedLangs as lang}
                  <Badge variant="outline">{lang.code.toUpperCase()}</Badge>
                {/each}
              </span>
              {#if taxRate}
                <Badge variant="outline" class="hidden sm:inline-block">{taxRate.name}</Badge>
              {/if}
            </span>
          </div>

          <!-- Action buttons -->
          <div
            class="flex shrink-0 items-center gap-1 pr-3 pl-4"
            onclick={(e) => e.stopPropagation()}
          >
            <IconButton
              icon={PlusIcon}
              tooltip="Add child category"
              size="sm"
              onclick={() => openCreateDialog(node.id)}
            />
            {#if hasChildren}
              <IconButton
                icon={Trash2}
                tooltip="Delete category"
                size="sm"
                variant="danger"
                onclick={() => requestDelete(node)}
              />
            {:else}
              <form method="POST" action="?/delete" use:enhance>
                <input type="hidden" name="id" value={node.id} />
                <IconButton
                  icon={Trash2}
                  tooltip="Delete category"
                  size="sm"
                  variant="danger"
                  type="submit"
                />
              </form>
            {/if}
            <IconButton
              icon={Pencil}
              tooltip="Edit category"
              size="sm"
              onclick={() => openEditDialog(node)}
            />
          </div>
        </div>

        <Collapsible.Content>
          {#each node.children as child}
            {@render categoryNode(child, depth + 1, fullPath)}
          {/each}
        </Collapsible.Content>
      </Collapsible.Root>
    {/snippet}

    {#if data.tree.length === 0}
      <div class="border-t border-border p-6 text-center">
        <p class="py-4 text-sm text-muted-foreground">
          No categories yet. Use the input above to add your first category.
        </p>
      </div>
    {:else}
      {#each data.tree as rootNode}
        {@render categoryNode(rootNode, 0, "")}
      {/each}
    {/if}
  </div>
</div>

<!-- Create Dialog -->
<Dialog.Root bind:open={createDialogOpen}>
  <Dialog.Content>
    <Dialog.Header>
      <Dialog.Title>New Category</Dialog.Title>
      <Dialog.Description>Create a new category for your store.</Dialog.Description>
    </Dialog.Header>
    <form
      method="POST"
      action="?/create"
      use:enhance={() => {
        return async ({ update }) => {
          await update();
          createDialogOpen = false;
        };
      }}
    >
      <div class="my-4 grid grid-cols-2 gap-4">
        <div>
          <Label for="create_name_en">Name</Label>
          <Input
            type="text"
            id="create_name_en"
            name="name_en"
            value={createName}
            oninput={handleCreateNameInput}
            placeholder="e.g., Electronics"
          />
        </div>
        <div>
          <Label for="create_slug">Slug</Label>
          <Input
            type="text"
            id="create_slug"
            name="slug"
            value={createSlug}
            oninput={handleCreateSlugInput}
            placeholder="e.g., electronics"
          />
        </div>
        {#each TRANSLATION_LANGUAGES as lang}
          <div class="col-span-2">
            <Label for="create_name_{lang.code}">{lang.name} name</Label>
            <Input
              type="text"
              id="create_name_{lang.code}"
              name="name_{lang.code}"
              placeholder="Leave empty to use default"
            />
          </div>
        {/each}
        <div>
          <Label for="create_parent">Parent</Label>
          <SelectNative id="create_parent" name="parent_id">
            <option value="">None (Root)</option>
            {#each flatCategories as category}
              <option value={category.id} selected={category.id === createParentId}>
                {"— ".repeat(category.depth)}{category.name}
              </option>
            {/each}
          </SelectNative>
        </div>
        <div>
          <Label for="create_tax_code">Tax Rate</Label>
          <SelectNative id="create_tax_code" name="tax_code">
            {#each data.taxRates as rate}
              <option value={rate.code} selected={rate.code === "standard"}>{rate.name}</option>
            {/each}
          </SelectNative>
        </div>
      </div>
      <Dialog.Footer class="mt-6">
        <Button type="button" variant="outline" onclick={() => (createDialogOpen = false)}>
          Cancel
        </Button>
        <Button type="submit">Create</Button>
      </Dialog.Footer>
    </form>
  </Dialog.Content>
</Dialog.Root>

<!-- Edit Dialog -->
<Dialog.Root bind:open={editDialogOpen}>
  <Dialog.Content>
    {#if editingCategory}
      <Dialog.Header>
        <Dialog.Title>Edit Category</Dialog.Title>
        <Dialog.Description>Update category details.</Dialog.Description>
      </Dialog.Header>
      <form
        method="POST"
        action="?/update"
        use:enhance={() => {
          return async ({ update }) => {
            await update();
            editDialogOpen = false;
          };
        }}
        class="my-4"
      >
        <input type="hidden" name="id" value={editingCategory.id} />
        <div class="grid grid-cols-2 gap-4">
          <div>
            <Label for="edit_name_{editingCategory.id}">Name</Label>
            <Input
              type="text"
              id="edit_name_{editingCategory.id}"
              name="name_en"
              value={editingCategory.name}
            />
          </div>
          <div>
            <Label for="edit_slug_{editingCategory.id}">Slug</Label>
            <Input
              type="text"
              id="edit_slug_{editingCategory.id}"
              name="slug"
              value={editingCategory.slug}
            />
          </div>
          {#each TRANSLATION_LANGUAGES as lang}
            <div class="col-span-2">
              <Label for="edit_name_{lang.code}_{editingCategory.id}">{lang.name} name</Label>
              <Input
                type="text"
                id="edit_name_{lang.code}_{editingCategory.id}"
                name="name_{lang.code}"
                value={data.categoryTranslations[editingCategory.id]?.find(
                  (t) => t.languageCode === lang.code
                )?.name ?? ""}
              />
            </div>
          {/each}
          <div>
            <Label for="edit_parent_{editingCategory.id}">Parent</Label>
            <SelectNative id="edit_parent_{editingCategory.id}" name="parent_id">
              <option value="">None (Root)</option>
              {#each flatCategories.filter((c) => c.id !== editingCategory!.id) as category}
                <option value={category.id} selected={category.id === editingCategory!.parentId}>
                  {"— ".repeat(category.depth)}{category.name}
                </option>
              {/each}
            </SelectNative>
          </div>
          <div>
            <Label for="edit_tax_code_{editingCategory.id}">Tax Rate</Label>
            <SelectNative id="edit_tax_code_{editingCategory.id}" name="tax_code">
              {#each data.taxRates as rate}
                <option value={rate.code} selected={rate.code === editingCategory!.taxCode}>
                  {rate.name}
                </option>
              {/each}
            </SelectNative>
          </div>
        </div>
        <Dialog.Footer class="mt-6">
          <Button type="button" variant="outline" onclick={() => (editDialogOpen = false)}>
            Cancel
          </Button>
          <Button type="submit">Save Changes</Button>
        </Dialog.Footer>
      </form>
      <div class="border-t border-border pt-4">
        {#if editingCategory.children.length > 0}
          <button
            type="button"
            class="text-sm text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
            onclick={() => {
              if (editingCategory) {
                editDialogOpen = false;
                requestDelete(editingCategory);
              }
            }}
          >
            Delete this category
          </button>
        {:else}
          <form
            method="POST"
            action="?/delete"
            use:enhance={() => {
              return async ({ update }) => {
                await update();
                editDialogOpen = false;
              };
            }}
          >
            <input type="hidden" name="id" value={editingCategory.id} />
            <button
              type="submit"
              class="text-sm text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
            >
              Delete this category
            </button>
          </form>
        {/if}
      </div>
    {/if}
  </Dialog.Content>
</Dialog.Root>

{#if deletingCategory}
  <DeleteConfirmDialog
    bind:open={showDeleteConfirm}
    title={`Delete "${deletingCategory.name}"?`}
    description={`This will also delete ${countDescendants(deletingCategory)} child ${countDescendants(deletingCategory) === 1 ? "category" : "categories"}. This action cannot be undone.`}
    ondeleted={() => (editDialogOpen = false)}
    oncancelled={() => {
      if (editingCategory) editDialogOpen = true;
    }}
  >
    <input type="hidden" name="id" value={deletingCategory.id} />
  </DeleteConfirmDialog>
{/if}
