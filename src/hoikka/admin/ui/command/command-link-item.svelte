<script lang="ts">
  import { Command as CommandPrimitive } from "bits-ui";
  import { cn } from "@hoikka/core/shared/utils";

  let {
    ref = $bindable(null),
    class: className,
    ...restProps
  }: CommandPrimitive.LinkItemProps = $props();
</script>

<CommandPrimitive.LinkItem
  bind:ref
  data-slot="command-item"
  class={cn(
    "relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none aria-selected:bg-accent-subtle aria-selected:text-blue-900 data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 dark:aria-selected:text-blue-300 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground",
    className
  )}
  {...restProps}
/>
