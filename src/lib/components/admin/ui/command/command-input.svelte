<script lang="ts">
  import { Command as CommandPrimitive } from "bits-ui";
  import SearchIcon from "@lucide/svelte/icons/search";
  import { cn } from "$lib/utils.js";

  let {
    ref = $bindable(null),
    class: className,
    value = $bindable(""),
    ...restProps
  }: CommandPrimitive.InputProps = $props();
</script>

<div
  class="flex h-9 items-center gap-2 border-b border-border ps-3 pe-8"
  data-slot="command-input-wrapper"
>
  <SearchIcon class="size-4 shrink-0 opacity-50" />
  <CommandPrimitive.Input
    data-slot="command-input"
    class={cn(
      "flex h-10 w-full rounded-md !border-transparent bg-transparent py-3 text-sm !shadow-none !ring-0 !outline-none placeholder:text-placeholder disabled:cursor-not-allowed disabled:opacity-50",
      className
    )}
    bind:ref
    {...restProps}
    bind:value
  />
</div>
