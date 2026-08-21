<script lang="ts">
  import * as Popover from "@hoikka/core/admin/ui/popover/index";
  import * as Command from "@hoikka/core/admin/ui/command/index";
  import { Badge } from "@hoikka/core/admin/ui/badge/index";
  import ChevronsUpDown from "@lucide/svelte/icons/chevrons-up-down";
  import Check from "@lucide/svelte/icons/check";
  import X from "@lucide/svelte/icons/x";

  export type ComboboxItem = {
    id: number;
    label: string;
    /** Optional group heading (e.g. the facet a value belongs to) */
    group?: string;
    /** Badge text when selected; defaults to label */
    badgeLabel?: string;
  };

  let {
    items,
    selected,
    onToggle,
    placeholder = "Select...",
    searchPlaceholder = "Search...",
    emptyText = "No results found.",
    showCount = false,
    form,
    name
  }: {
    items: ComboboxItem[];
    selected: number[];
    onToggle: (id: number) => void;
    placeholder?: string;
    searchPlaceholder?: string;
    emptyText?: string;
    /** Show "N selected" in the trigger instead of the placeholder */
    showCount?: boolean;
    /** Emit a hidden input per selected id into this form */
    form?: string;
    /** Name for the hidden inputs (required with `form`) */
    name?: string;
  } = $props();

  let open = $state(false);

  const groups = $derived.by(() => {
    const map = new Map<string, ComboboxItem[]>();
    for (const item of items) {
      const key = item.group ?? "";
      map.set(key, [...(map.get(key) ?? []), item]);
    }
    return [...map.entries()];
  });

  const selectedItems = $derived(items.filter((item) => selected.includes(item.id)));

  const triggerLabel = $derived(
    showCount && selected.length > 0 ? `${selected.length} selected` : placeholder
  );
</script>

<Popover.Root bind:open>
  <Popover.Trigger
    class="flex w-full items-center justify-between rounded-lg border border-input-border bg-surface px-3 py-2 text-sm hover:bg-hover"
    aria-expanded={open}
    aria-haspopup="listbox"
  >
    <span class="truncate text-muted-foreground">{triggerLabel}</span>
    <ChevronsUpDown class="ml-2 h-4 w-4 shrink-0 opacity-50" />
  </Popover.Trigger>
  <Popover.Content class="w-[var(--bits-popover-trigger-width)] min-w-72 p-0" align="start">
    <Command.Root>
      <Command.Input placeholder={searchPlaceholder} />
      <Command.List class="max-h-64">
        <Command.Empty>{emptyText}</Command.Empty>
        {#each groups as [heading, groupItems] (heading)}
          <Command.Group heading={heading || undefined}>
            {#each groupItems as item (item.id)}
              <Command.Item
                value={heading ? `${heading} ${item.label}` : item.label}
                onSelect={() => onToggle(item.id)}
                class="cursor-pointer"
              >
                <div class="flex w-full items-center gap-2">
                  <div class="flex h-4 w-4 items-center justify-center">
                    {#if selected.includes(item.id)}
                      <Check class="h-4 w-4" />
                    {/if}
                  </div>
                  <span>{item.label}</span>
                </div>
              </Command.Item>
            {/each}
          </Command.Group>
        {/each}
      </Command.List>
    </Command.Root>
  </Popover.Content>
</Popover.Root>

{#if selectedItems.length > 0}
  <div class="mt-3 flex flex-wrap gap-1.5">
    {#each selectedItems as item (item.id)}
      <Badge class="gap-1">
        {item.badgeLabel ?? item.label}
        <button
          type="button"
          onclick={() => onToggle(item.id)}
          class="ml-0.5 rounded-full p-0.5 hover:bg-blue-200 dark:hover:bg-blue-500/20"
          aria-label="Remove {item.badgeLabel ?? item.label}"
        >
          <X class="h-3 w-3" />
        </button>
      </Badge>
      {#if form && name}
        <input {form} type="hidden" {name} value={item.id} />
      {/if}
    {/each}
  </div>
{/if}
