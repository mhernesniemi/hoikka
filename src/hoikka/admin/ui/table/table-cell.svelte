<script lang="ts">
  import { cn, type WithElementRef } from "@hoikka/core/shared/utils";
  import type { HTMLTdAttributes } from "svelte/elements";

  let {
    ref = $bindable(null),
    class: className,
    children,
    ...restProps
  }: WithElementRef<HTMLTdAttributes> = $props();
</script>

<td
  bind:this={ref}
  data-slot="table-cell"
  class={cn("px-6 py-4 [&:has([role=checkbox])]:pe-0", className)}
  {...restProps}
>
  {@render children?.()}
</td>
