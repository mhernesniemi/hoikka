<script lang="ts">
  import { cn } from "@hoikka/core/shared/utils";
  import { Dialog as DialogPrimitive } from "bits-ui";

  let {
    class: className,
    children,
    ...restProps
  }: DialogPrimitive.DescriptionProps & { children?: import("svelte").Snippet } = $props();
</script>

<DialogPrimitive.Description class={cn("text-sm text-muted-foreground", className)} {...restProps}>
  {@render children?.()}
</DialogPrimitive.Description>
