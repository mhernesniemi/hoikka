<script lang="ts">
  import { cn, type WithElementRef } from "@hoikka/core/shared/utils";
  import type { HTMLAttributes } from "svelte/elements";

  let {
    ref = $bindable(null),
    class: className,
    children,
    ...restProps
  }: WithElementRef<HTMLAttributes<HTMLSpanElement>> = $props();
</script>

<span
  bind:this={ref}
  data-slot="command-shortcut"
  class={cn("ms-auto text-xs tracking-widest text-gray-500", className)}
  {...restProps}
>
  {@render children?.()}
</span>
