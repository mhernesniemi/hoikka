<script lang="ts">
  import * as Popover from "$lib/components/admin/ui/popover";
  import * as Command from "$lib/components/admin/ui/command";
  import { cn } from "$lib/utils.js";
  import ChevronsUpDown from "@lucide/svelte/icons/chevrons-up-down";
  import Check from "@lucide/svelte/icons/check";

  type FlatCategory = { id: number; name: string; depth: number };

  type SingleProps = {
    mode?: "single";
    value: string;
    onchange: (value: string) => void;
    showRoot?: boolean;
    rootLabel?: string;
  };

  type MultiProps = {
    mode: "multi";
    selected: number[];
    onToggle: (id: number) => void;
  };

  type Props = (SingleProps | MultiProps) & {
    categories: FlatCategory[];
    placeholder?: string;
    triggerClass?: string;
  };

  let { categories, placeholder = "Search categories...", triggerClass, ...rest }: Props = $props();

  let open = $state(false);

  const isSingle = $derived(rest.mode !== "multi");

  const triggerLabel = $derived.by(() => {
    if (rest.mode === "multi") {
      const count = rest.selected.length;
      return count > 0 ? `${count} selected` : "Select categories...";
    }
    const rootLabel = rest.rootLabel ?? "Root";
    if (!rest.value) return rootLabel;
    return categories.find((c) => c.id === Number(rest.value))?.name ?? rootLabel;
  });

  function isSelected(id: number): boolean {
    if (rest.mode === "multi") return rest.selected.includes(id);
    return rest.value === String(id);
  }

  function handleSelect(id: number) {
    if (rest.mode === "multi") {
      rest.onToggle(id);
    } else {
      rest.onchange(String(id));
      open = false;
    }
  }
</script>

<Popover.Root bind:open>
  <Popover.Trigger
    class={cn(
      "flex w-full items-center justify-between rounded-lg border border-input-border bg-surface px-3 py-2 text-sm hover:bg-hover",
      triggerClass
    )}
  >
    <span class="truncate">{triggerLabel}</span>
    <ChevronsUpDown class="ml-2 h-4 w-4 shrink-0 opacity-50" />
  </Popover.Trigger>
  <Popover.Content class="w-[var(--bits-popover-trigger-width)] p-0" align="start">
    <Command.Root>
      <Command.Input {placeholder} />
      <Command.List class="max-h-64">
        <Command.Empty>No category found.</Command.Empty>
        <Command.Group>
          {#if isSingle && rest.mode !== "multi" && (rest.showRoot ?? true)}
            <Command.Item
              value={rest.rootLabel ?? "Root"}
              onSelect={() => {
                rest.onchange("");
                open = false;
              }}
              class="cursor-pointer"
            >
              <div class="flex w-full items-center gap-2">
                <div class="flex h-4 w-4 items-center justify-center">
                  {#if !rest.value}
                    <Check class="h-4 w-4" />
                  {/if}
                </div>
                <span>{rest.rootLabel ?? "Root"}</span>
              </div>
            </Command.Item>
          {/if}
          {#each categories as category}
            <Command.Item
              value={category.name}
              onSelect={() => handleSelect(category.id)}
              class="cursor-pointer"
            >
              <div class="flex w-full items-center gap-2">
                <div class="flex h-4 w-4 items-center justify-center">
                  {#if isSelected(category.id)}
                    <Check class="h-4 w-4" />
                  {/if}
                </div>
                <span>{"— ".repeat(category.depth)}{category.name}</span>
              </div>
            </Command.Item>
          {/each}
        </Command.Group>
      </Command.List>
    </Command.Root>
  </Popover.Content>
</Popover.Root>
