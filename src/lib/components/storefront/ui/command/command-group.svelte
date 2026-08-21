<script lang="ts">
  import { Command as CommandPrimitive, useId } from "bits-ui";
  import { cn } from "@hoikka/core/shared/utils";

  let {
    ref = $bindable(null),
    class: className,
    children,
    heading,
    value,
    ...restProps
  }: CommandPrimitive.GroupProps & {
    heading?: string;
  } = $props();
</script>

<CommandPrimitive.Group
  bind:ref
  data-slot="command-group"
  class={cn("overflow-hidden p-1 text-gray-900", className)}
  value={value ?? heading ?? `----${useId()}`}
  {...restProps}
>
  {#if heading}
    <CommandPrimitive.GroupHeading class="px-2 py-1.5 text-xs font-medium text-gray-500">
      {heading}
    </CommandPrimitive.GroupHeading>
  {/if}
  <CommandPrimitive.GroupItems {children} />
</CommandPrimitive.Group>
