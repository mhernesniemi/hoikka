<script lang="ts">
  import { cn } from "@hoikka/core/shared/utils";
  import type { HTMLLabelAttributes } from "svelte/elements";

  let {
    class: className,
    children,
    ...restProps
  }: HTMLLabelAttributes & { children?: import("svelte").Snippet } = $props();
</script>

<label
  class={cn(
    "mb-[var(--label-margin)] block text-sm font-medium text-foreground-secondary peer-disabled:cursor-not-allowed peer-disabled:opacity-70",
    className
  )}
  {...restProps}
>
  {@render children?.()}
</label>
