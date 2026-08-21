<script lang="ts">
  import { Dialog as SheetPrimitive } from "bits-ui";
  import { cn } from "@hoikka/core/shared/utils";

  let {
    ref = $bindable(null),
    class: className,
    ...restProps
  }: SheetPrimitive.TitleProps = $props();
</script>

<SheetPrimitive.Title
  bind:ref
  data-slot="sheet-title"
  class={cn("text-lg font-semibold text-gray-900", className)}
  {...restProps}
/>
