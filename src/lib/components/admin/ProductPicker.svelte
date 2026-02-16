<script lang="ts">
  import * as Popover from "$lib/components/admin/ui/popover";
  import * as Command from "$lib/components/admin/ui/command";
  import ChevronsUpDown from "@lucide/svelte/icons/chevrons-up-down";
  import Check from "@lucide/svelte/icons/check";
  import ImageIcon from "@lucide/svelte/icons/image";

  type CatalogProduct = {
    id: number;
    name: string;
    slug: string;
    price: number;
    image: string | null;
  };

  let {
    products,
    selected,
    onToggle
  }: {
    products: CatalogProduct[];
    selected: number[];
    onToggle: (product: CatalogProduct) => void;
  } = $props();

  let open = $state(false);

  const triggerLabel = $derived(
    selected.length > 0 ? `${selected.length} selected` : "Select products..."
  );

  function isSelected(id: number): boolean {
    return selected.includes(id);
  }
</script>

<Popover.Root bind:open>
  <Popover.Trigger
    class="flex w-full items-center justify-between rounded-lg border border-input-border bg-surface px-3 py-2 text-sm hover:bg-hover"
  >
    <span class="truncate text-muted-foreground">{triggerLabel}</span>
    <ChevronsUpDown class="ml-2 h-4 w-4 shrink-0 opacity-50" />
  </Popover.Trigger>
  <Popover.Content class="w-[var(--bits-popover-trigger-width)] p-0" align="start">
    <Command.Root>
      <Command.Input placeholder="Search products..." />
      <Command.List class="max-h-64">
        <Command.Empty>No products found.</Command.Empty>
        <Command.Group>
          {#each products as product}
            <Command.Item
              value={product.name}
              onSelect={() => onToggle(product)}
              class="cursor-pointer"
            >
              <div class="flex w-full items-center gap-2">
                <div class="flex h-4 w-4 items-center justify-center">
                  {#if isSelected(product.id)}
                    <Check class="h-4 w-4" />
                  {/if}
                </div>
                {#if product.image}
                  <img
                    src="{product.image}?tr=w-64,h-64,fo-auto"
                    alt={product.name}
                    class="h-6 w-6 rounded object-cover"
                  />
                {:else}
                  <div
                    class="flex h-6 w-6 items-center justify-center rounded bg-muted text-muted-foreground"
                  >
                    <ImageIcon class="h-3 w-3" />
                  </div>
                {/if}
                <span>{product.name}</span>
              </div>
            </Command.Item>
          {/each}
        </Command.Group>
      </Command.List>
    </Command.Root>
  </Popover.Content>
</Popover.Root>
