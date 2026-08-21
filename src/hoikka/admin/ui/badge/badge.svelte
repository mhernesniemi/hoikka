<script lang="ts" module>
  import { tv, type VariantProps } from "tailwind-variants";

  export const badgeVariants = tv({
    base: "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
    variants: {
      variant: {
        default: "bg-accent-subtle text-blue-800 dark:text-blue-300",
        secondary: "bg-muted text-foreground",
        success: "bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-300",
        warning: "bg-yellow-100 text-yellow-800 dark:bg-yellow-500/15 dark:text-yellow-300",
        destructive: "bg-destructive-subtle text-red-800 dark:text-red-300",
        outline: "border border-input-border text-foreground-secondary"
      }
    },
    defaultVariants: {
      variant: "default"
    }
  });

  export type BadgeVariant = VariantProps<typeof badgeVariants>["variant"];
</script>

<script lang="ts">
  import { cn } from "@hoikka/core/shared/utils";
  import type { HTMLAttributes } from "svelte/elements";

  let {
    class: className,
    variant = "default",
    children,
    ...restProps
  }: HTMLAttributes<HTMLSpanElement> & {
    variant?: BadgeVariant;
    children?: import("svelte").Snippet;
  } = $props();
</script>

<span class={cn(badgeVariants({ variant }), className)} {...restProps}>
  {@render children?.()}
</span>
