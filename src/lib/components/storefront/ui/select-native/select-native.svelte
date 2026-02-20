<script lang="ts">
  import { cn } from "$lib/utils.js";
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
    "rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:border-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none",
    className
  )}
  bind:value
  {...restProps}
>
  {#if children}
    {@render children()}
  {/if}
</select>
