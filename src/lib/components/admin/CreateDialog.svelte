<script lang="ts">
  import { enhance } from "$app/forms";
  import { Button } from "$lib/components/admin/ui/button";
  import * as Dialog from "$lib/components/admin/ui/dialog";
  import { Input } from "$lib/components/admin/ui/input";
  import { Label } from "$lib/components/admin/ui/label";
  import { slugify } from "$lib/utils";

  let {
    open = $bindable(false),
    title,
    description = "You'll be redirected to edit its details.",
    action,
    placeholder = "",
    fieldName = "name",
    slugField = "slug"
  }: {
    open: boolean;
    title: string;
    description?: string;
    action: string;
    placeholder?: string;
    fieldName?: string;
    slugField?: string;
  } = $props();

  let name = $state("");
  const slug = $derived(slugify(name));

  function reset() {
    name = "";
  }

  $effect(() => {
    if (open) reset();
  });

  function handleKeydown(e: KeyboardEvent) {
    if (
      e.key === "c" &&
      !e.metaKey &&
      !e.ctrlKey &&
      !e.altKey &&
      !(
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target instanceof HTMLElement && e.target.isContentEditable)
      )
    ) {
      e.preventDefault();
      open = true;
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<Dialog.Root bind:open>
  <Dialog.Content>
    <Dialog.Header>
      <Dialog.Title>{title}</Dialog.Title>
      <Dialog.Description>{description}</Dialog.Description>
    </Dialog.Header>
    <form
      method="POST"
      {action}
      use:enhance={() => {
        return async ({ update }) => {
          open = false;
          await update();
        };
      }}
    >
      <input type="hidden" name={slugField} value={slug} />
      <div class="my-4">
        <Label for="create_dialog_name">Name</Label>
        <Input
          type="text"
          id="create_dialog_name"
          name={fieldName}
          bind:value={name}
          required
          {placeholder}
        />
      </div>
      <Dialog.Footer>
        <Button type="button" variant="outline" onclick={() => (open = false)}>Cancel</Button>
        <Button type="submit" disabled={!name.trim()}>Create</Button>
      </Dialog.Footer>
    </form>
  </Dialog.Content>
</Dialog.Root>
