<script lang="ts">
  import { enhance } from "$app/forms";
  import { Button } from "$lib/components/admin/ui/button";
  import * as Dialog from "$lib/components/admin/ui/dialog";
  import type { Snippet } from "svelte";

  let {
    open = $bindable(false),
    title = "Delete?",
    description = "This action cannot be undone.",
    action = "?/delete",
    ondeleted,
    oncancelled,
    children
  }: {
    open: boolean;
    title?: string;
    description?: string;
    action?: string;
    ondeleted?: () => void;
    oncancelled?: () => void;
    children?: Snippet;
  } = $props();

  let deleting = false;
</script>

<Dialog.Root
  bind:open
  onOpenChange={(isOpen) => {
    if (!isOpen && !deleting) oncancelled?.();
    deleting = false;
  }}
>
  <Dialog.Content>
    <Dialog.Header>
      <Dialog.Title>{title}</Dialog.Title>
      <Dialog.Description>{description}</Dialog.Description>
    </Dialog.Header>
    <Dialog.Footer>
      <Button variant="outline" onclick={() => (open = false)}>Cancel</Button>
      <form
        method="POST"
        {action}
        use:enhance={() => {
          deleting = true;
          return async ({ update }) => {
            open = false;
            ondeleted?.();
            await update();
          };
        }}
      >
        {#if children}
          {@render children()}
        {/if}
        <Button type="submit" variant="destructive">Delete</Button>
      </form>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
