<script lang="ts" module>
  import { tv, type VariantProps } from "tailwind-variants";

  export const alertVariants = tv({
    base: "relative w-full rounded-lg border p-4 [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-4 [&>svg~*]:pl-7",
    variants: {
      variant: {
        default: "border-gray-200 bg-gray-50 text-gray-700",
        success: "border-green-200 bg-green-50 text-green-700",
        warning: "border-yellow-200 bg-yellow-50 text-yellow-700",
        destructive: "border-red-200 bg-red-50 text-red-700",
        info: "border-blue-200 bg-blue-50 text-blue-700"
      }
    },
    defaultVariants: {
      variant: "default"
    }
  });

  export type AlertVariant = VariantProps<typeof alertVariants>["variant"];
</script>

<script lang="ts">
  import { cn } from "@hoikka/core/shared/utils";
  import type { HTMLAttributes } from "svelte/elements";

  let {
    class: className,
    variant = "default",
    children,
    ...restProps
  }: HTMLAttributes<HTMLDivElement> & {
    variant?: AlertVariant;
    children?: import("svelte").Snippet;
  } = $props();
</script>

<div role="alert" class={cn(alertVariants({ variant }), className)} {...restProps}>
  {@render children?.()}
</div>
