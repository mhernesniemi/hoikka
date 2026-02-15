<script lang="ts">
  import { cn } from "$lib/utils.js";
  import type { HTMLAttributes } from "svelte/elements";

  let {
    class: className,
    children,
    ...restProps
  }: HTMLAttributes<HTMLDivElement> & { children?: import("svelte").Snippet } = $props();
</script>

<div
  class={cn("mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end", className)}
  {...restProps}
>
  {@render children?.()}
</div>
