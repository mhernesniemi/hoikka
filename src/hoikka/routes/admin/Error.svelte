<script lang="ts">
  import { page } from "$app/state";
  import { buttonVariants } from "@hoikka/core/admin/ui/button/index";
  import ChevronLeft from "@lucide/svelte/icons/chevron-left";
  import { cn } from "@hoikka/core/shared/utils";
</script>

<div class="flex min-h-[60vh] flex-col items-center justify-center text-center">
  <p class="text-6xl font-bold text-foreground">{page.status}</p>
  <p class="mt-3 text-lg text-muted-foreground">
    {page.status === 404
      ? "The page you're looking for doesn't exist."
      : page.error?.message || "Something went wrong."}
  </p>
  <a href="/admin/orders" class={cn(buttonVariants({ variant: "outline" }), "mt-6")}>
    <ChevronLeft class="h-4 w-4" />
    Back to dashboard
  </a>
</div>
