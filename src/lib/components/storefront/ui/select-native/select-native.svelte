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
    "rounded-md border border-gray-300 bg-white px-3 py-1.5 pr-8 text-sm text-gray-700 hover:border-gray-400",
    className
  )}
  bind:value
  {...restProps}
>
  {#if children}
    {@render children()}
  {/if}
</select>
