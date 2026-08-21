<script lang="ts">
  import type { HTMLTableAttributes } from "svelte/elements";
  import { cn, type WithElementRef } from "@hoikka/core/shared/utils";

  let {
    ref = $bindable(null),
    class: className,
    children,
    ...restProps
  }: WithElementRef<HTMLTableAttributes> = $props();
</script>

<div
  data-slot="table-container"
  class={cn("overflow-x-auto rounded-lg border border-border bg-surface shadow", className)}
>
  <table bind:this={ref} data-slot="table" class="min-w-full divide-y divide-border" {...restProps}>
    {@render children?.()}
  </table>
</div>
