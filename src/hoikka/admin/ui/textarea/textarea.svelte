<script lang="ts">
  import { cn } from "@hoikka/core/shared/utils";
  import type { HTMLTextareaAttributes } from "svelte/elements";

  let { class: className, value = $bindable(), ...restProps }: HTMLTextareaAttributes = $props();
</script>

<textarea
  class={cn(
    "w-full rounded-lg border border-input-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-placeholder hover:border-foreground/20 disabled:cursor-not-allowed disabled:opacity-50",
    className
  )}
  bind:value
  {...restProps}></textarea>
