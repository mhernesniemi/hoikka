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

<thead
  bind:this={ref}
  data-slot="table-header"
  class={cn("bg-muted-strong/60", className)}
  {...restProps}
>
  {@render children?.()}
</thead>
