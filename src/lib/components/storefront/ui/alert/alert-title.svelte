<script lang="ts">
  import { cn } from "@hoikka/core/shared/utils";
  import type { HTMLAttributes } from "svelte/elements";

  let {
    class: className,
    children,
    ...restProps
  }: HTMLAttributes<HTMLHeadingElement> & { children?: import("svelte").Snippet } = $props();
</script>

<h5 class={cn("mb-1 leading-none font-medium tracking-tight", className)} {...restProps}>
  {@render children?.()}
</h5>
