<script lang="ts">
  import { cn, type WithElementRef } from "@hoikka/core/shared/utils";
  import type { HTMLThAttributes } from "svelte/elements";

  let {
    ref = $bindable(null),
    class: className,
    children,
    ...restProps
  }: WithElementRef<HTMLThAttributes> = $props();
</script>

<th
  bind:this={ref}
  data-slot="table-head"
  class={cn(
    "px-6 py-3 text-left text-xs font-medium text-foreground-tertiary uppercase [&:has([role=checkbox])]:pe-0",
    className
  )}
  {...restProps}
>
  {@render children?.()}
</th>
