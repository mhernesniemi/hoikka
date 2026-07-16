<script lang="ts">
  import { cn } from "$lib/utils.js";
  import type { HTMLInputAttributes } from "svelte/elements";

  let { class: className, value = $bindable(), ...restProps }: HTMLInputAttributes = $props();
</script>

<input
  class={cn(
    "flex w-full rounded-lg border border-input-border bg-surface px-3 py-2 text-sm text-foreground file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-placeholder hover:border-input-border-hover disabled:cursor-not-allowed disabled:opacity-50",
    className
  )}
  bind:value
  {...restProps}
/>
