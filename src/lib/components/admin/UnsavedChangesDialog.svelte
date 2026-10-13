<script lang="ts">
  import { Button } from "$lib/components/admin/ui/button";
  import * as Dialog from "$lib/components/admin/ui/dialog";
  import { useUnsavedChanges } from "$lib/unsaved-changes.svelte";

  let {
    isDirty,
    isSaving
  }: {
    isDirty: () => boolean;
    isSaving?: () => boolean;
  } = $props();

  const unsaved = useUnsavedChanges(
    () => isDirty(),
    () => isSaving?.() ?? false
  );
</script>

<Dialog.Root
  open={unsaved.showDialog}
  onOpenChange={(v) => {
    if (!v) unsaved.cancelLeave();
  }}
>
  <Dialog.Content>
    <Dialog.Header>
      <Dialog.Title>Unsaved changes</Dialog.Title>
      <Dialog.Description class="mt-1 mb-6">
        You have unsaved changes. Are you sure you want to leave?
      </Dialog.Description>
    </Dialog.Header>
    <Dialog.Footer>
      <Button variant="outline" onclick={unsaved.cancelLeave}>Stay on page</Button>
      <Button variant="destructive" onclick={unsaved.confirmLeave}>Leave page</Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
