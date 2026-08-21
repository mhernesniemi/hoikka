<script lang="ts">
  import { cn } from "@hoikka/core/shared/utils";
  import type { HTMLSelectAttributes } from "svelte/elements";
  import type { Snippet } from "svelte";

  let {
    class: className,
    children,
    value = $bindable(),
    ...restProps
  }: HTMLSelectAttributes & { children?: Snippet } = $props();
</script>

<select
  class={cn(
    "w-full truncate rounded-lg border border-input-border bg-surface py-2 pr-8 pl-3 text-sm text-foreground hover:border-foreground/20 hover:bg-hover disabled:cursor-not-allowed disabled:opacity-50",
    className
  )}
  bind:value
  {...restProps}
>
  {#if children}
    {@render children()}
  {/if}
</select>
