<script lang="ts">
  import { cn } from "@hoikka/core/shared/utils";
  import type { HTMLAttributes } from "svelte/elements";

  let {
    class: className,
    children,
    ...restProps
  }: HTMLAttributes<HTMLParagraphElement> & { children?: import("svelte").Snippet } = $props();
</script>

<div class={cn("text-sm [&_p]:leading-relaxed", className)} {...restProps}>
  {@render children?.()}
</div>
