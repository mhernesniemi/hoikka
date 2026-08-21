<script lang="ts">
  import { cn, type WithElementRef } from "@hoikka/core/shared/utils";
  import type { HTMLAttributes } from "svelte/elements";

  let {
    ref = $bindable(null),
    class: className,
    children,
    ...restProps
  }: WithElementRef<HTMLAttributes<HTMLTableSectionElement>> = $props();
</script>

<tbody
  bind:this={ref}
  data-slot="table-body"
  class={cn("divide-y divide-border bg-surface", className)}
  {...restProps}
>
  {@render children?.()}
</tbody>
