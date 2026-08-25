<script lang="ts">
  /**
   * The "⋮" menu beside a detail page's Save button, holding the rare,
   * destructive actions that used to sit as a red link at the page bottom.
   */
  import * as DropdownMenu from "$lib/components/admin/ui/dropdown-menu";
  import { Button } from "$lib/components/admin/ui/button";
  import EllipsisVertical from "@lucide/svelte/icons/ellipsis-vertical";
  import Trash2 from "@lucide/svelte/icons/trash-2";

  let {
    deleteLabel,
    ondelete
  }: {
    /** e.g. "Delete this product" */
    deleteLabel: string;
    ondelete: () => void;
  } = $props();

  let open = $state(false);
</script>

<DropdownMenu.Root bind:open>
  <DropdownMenu.Trigger>
    {#snippet child({ props })}
      <Button variant="outline" size="icon" aria-label="More actions" {...props}>
        <EllipsisVertical class="h-4 w-4" />
      </Button>
    {/snippet}
  </DropdownMenu.Trigger>
  <DropdownMenu.Content align="end">
    <DropdownMenu.Item
      class="text-red-600 data-highlighted:bg-red-500/10 data-highlighted:text-red-600 dark:text-red-400 dark:data-highlighted:text-red-400 [&_svg]:!text-current"
      onclick={() => {
        open = false;
        ondelete();
      }}
    >
      <Trash2 class="h-4 w-4" />
      {deleteLabel}
    </DropdownMenu.Item>
  </DropdownMenu.Content>
</DropdownMenu.Root>
