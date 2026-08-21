<script lang="ts">
  import { Command as CommandPrimitive } from "bits-ui";
  import { cn } from "@hoikka/core/shared/utils";

  let {
    ref = $bindable(null),
    class: className,
    ...restProps
  }: CommandPrimitive.SeparatorProps = $props();
</script>

<CommandPrimitive.Separator
  bind:ref
  data-slot="command-separator"
  class={cn("-mx-1 h-px bg-gray-200", className)}
  {...restProps}
/>
