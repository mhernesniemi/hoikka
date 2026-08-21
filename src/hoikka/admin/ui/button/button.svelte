<script lang="ts" module>
  import { tv, type VariantProps } from "tailwind-variants";

  export const buttonVariants = tv({
    base: "cursor-pointer inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
    variants: {
      variant: {
        default:
          "border-[length:var(--btn-primary-border-width)] border-primary-border bg-primary text-primary-foreground hover:bg-primary-hover",
        destructive:
          "bg-red-600 text-white hover:bg-red-700 dark:bg-red-600/60 dark:hover:bg-red-600/50",
        "destructive-outline": "border border-red-300 text-red-600 hover:bg-destructive-subtle",
        "destructive-ghost": "text-red-600 hover:text-red-800 hover:bg-destructive-subtle",
        outline: "border border-input-border bg-surface text-button-foreground hover:bg-hover",
        secondary: "border border-input-border bg-muted text-foreground hover:bg-muted-strong",
        ghost: "text-button-foreground hover:bg-muted",
        link: "text-blue-600 dark:text-blue-400 underline-offset-4 hover:underline"
      },
      size: {
        default: "h-10 px-4 py-2",
        xs: "h-9 px-3 text-xs",
        sm: "h-9 px-3 py-1 text-sm",
        lg: "h-11 px-8",
        xl: "h-12 px-12 text-base",
        icon: "size-10"
      }
    },
    defaultVariants: {
      variant: "default",
      size: "default"
    }
  });

  export type ButtonVariant = VariantProps<typeof buttonVariants>["variant"];
  export type ButtonSize = VariantProps<typeof buttonVariants>["size"];
  export type ButtonProps = {
    variant?: ButtonVariant;
    size?: ButtonSize;
    class?: string;
  } & Omit<HTMLButtonAttributes, "class">;
</script>

<script lang="ts">
  import { cn } from "@hoikka/core/shared/utils";
  import type { HTMLButtonAttributes } from "svelte/elements";

  let {
    class: className,
    variant = "default",
    size = "default",
    children,
    ...restProps
  }: ButtonProps & { children?: import("svelte").Snippet } = $props();
</script>

<button class={cn(buttonVariants({ variant, size }), className)} {...restProps}>
  {@render children?.()}
</button>
