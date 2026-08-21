<script lang="ts">
  import { cn } from "@hoikka/core/shared/utils";
  import { Dialog as DialogPrimitive } from "bits-ui";
  import DialogOverlay from "./dialog-overlay.svelte";

  let {
    class: className,
    children,
    ...restProps
  }: DialogPrimitive.ContentProps & { children?: import("svelte").Snippet } = $props();
</script>

<DialogPrimitive.Portal to="[data-admin]">
  <DialogOverlay />
  <DialogPrimitive.Content
    class={cn(
      "fixed top-1/2 left-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-lg bg-surface p-6 font-sans text-foreground shadow-xl duration-200 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
      className
    )}
    {...restProps}
  >
    {@render children?.()}
  </DialogPrimitive.Content>
</DialogPrimitive.Portal>
