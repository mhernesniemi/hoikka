<script lang="ts">
  import * as Tooltip from "$lib/components/admin/ui/tooltip";
  import { buttonVariants } from "$lib/components/admin/ui/button";
  import { cn } from "$lib/utils";
  import type { Component } from "svelte";

  let {
    icon,
    tooltip,
    href,
    onclick,
    type = "button",
    variant = "default",
    size = "default",
    class: className
  }: {
    icon: Component<{ class?: string }>;
    tooltip: string;
    href?: string;
    onclick?: (e: MouseEvent) => void;
    type?: "button" | "submit";
    variant?: "default" | "danger";
    size?: "default" | "sm";
    class?: string;
  } = $props();

  const btnSize = size === "sm" ? "h-7 w-7" : "h-8 w-8";
  const iconSize = size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4";

  const btnClass = $derived(
    buttonVariants({
      variant: "ghost",
      size: "icon",
      className: cn(
        btnSize,
        variant === "danger" && "hover:bg-red-500/10 hover:text-red-600",
        variant === "default" && "hover:bg-foreground/10 hover:text-foreground",
        className
      )
    })
  );
</script>

<Tooltip.Provider>
  <Tooltip.Root ignoreNonKeyboardFocus>
    {#if href}
      <Tooltip.Trigger>
        {#snippet child({ props })}
          <a {...props} {href} class={btnClass}>
            {@render iconSlot()}
          </a>
        {/snippet}
      </Tooltip.Trigger>
    {:else}
      <Tooltip.Trigger {type} class={btnClass} {onclick}>
        {@render iconSlot()}
      </Tooltip.Trigger>
    {/if}
    <Tooltip.Content>{tooltip}</Tooltip.Content>
  </Tooltip.Root>
</Tooltip.Provider>

{#snippet iconSlot()}
  {@const Icon = icon}
  <Icon class={iconSize} />
{/snippet}
