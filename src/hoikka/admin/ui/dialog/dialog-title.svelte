<script lang="ts">
  import { cn } from "@hoikka/core/shared/utils";
  import { Dialog as DialogPrimitive } from "bits-ui";

  let {
    class: className,
    children,
    ...restProps
  }: DialogPrimitive.TitleProps & { children?: import("svelte").Snippet } = $props();
</script>

<DialogPrimitive.Title
  class={cn("text-lg leading-none font-semibold tracking-tight", className)}
  {...restProps}
>
  {@render children?.()}
</DialogPrimitive.Title>
