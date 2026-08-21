<script lang="ts">
  import type { Header } from "@tanstack/table-core";
  import { FlexRender } from "@hoikka/core/admin/ui/data-table/index";
  import ArrowUp from "@lucide/svelte/icons/arrow-up";
  import ArrowDown from "@lucide/svelte/icons/arrow-down";
  import ArrowUpDown from "@lucide/svelte/icons/arrow-up-down";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let { header }: { header: Header<any, any> } = $props();
</script>

{#if !header.isPlaceholder}
  {#if header.column.getCanSort()}
    <button
      class="flex items-center gap-1 font-medium uppercase hover:text-foreground"
      onclick={header.column.getToggleSortingHandler()}
    >
      <FlexRender content={header.column.columnDef.header} context={header.getContext()} />
      {#if header.column.getIsSorted() === "asc"}
        <ArrowUp class="h-3.5 w-3.5" />
      {:else if header.column.getIsSorted() === "desc"}
        <ArrowDown class="h-3.5 w-3.5" />
      {:else}
        <ArrowUpDown class="h-3.5 w-3.5 text-placeholder" />
      {/if}
    </button>
  {:else}
    <FlexRender content={header.column.columnDef.header} context={header.getContext()} />
  {/if}
{/if}
