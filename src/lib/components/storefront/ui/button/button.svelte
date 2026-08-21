<script lang="ts" module>
  import { tv, type VariantProps } from "tailwind-variants";

  export const buttonVariants = tv({
    base: "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
    variants: {
      variant: {
        default: "border bg-[#f7d0dd]/50 hover:bg-[#f7d0dd]/60",
        secondary: "border bg-gray-100 hover:bg-gray-200/60",
        outline: "border border-gray-300 bg-white text-gray-900 hover:bg-gray-50",
        destructive: "bg-red-600 text-white hover:bg-red-700",
        "destructive-outline": "border border-red-300 text-red-600 hover:bg-red-50",
        ghost: "text-gray-900 hover:bg-gray-100",
        link: "text-blue-600 underline-offset-4 hover:underline"
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 px-3 text-xs",
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
