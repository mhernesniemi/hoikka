<script lang="ts">
  import { cn } from "@hoikka/core/shared/utils";
  import type { HTMLInputAttributes } from "svelte/elements";

  let {
    class: className,
    value = $bindable(""),
    ...restProps
  }: HTMLInputAttributes & { value?: string } = $props();
</script>

<input
  class={cn(
    "flex w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-gray-400 disabled:cursor-not-allowed disabled:opacity-50",
    className
  )}
  bind:value
  {...restProps}
/>
