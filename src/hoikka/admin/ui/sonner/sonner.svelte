<script lang="ts">
  import { Toaster as SonnerToaster, type ToasterProps } from "svelte-sonner";

  let { ...props }: ToasterProps = $props();
</script>

<SonnerToaster
  class="toaster group"
  toastOptions={{
    classes: {
      toast:
        "group toast group-[.toaster]:bg-surface group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg group-[.toaster]:rounded-lg",
      description: "group-[.toast]:text-muted-foreground",
      actionButton: "group-[.toast]:bg-foreground group-[.toast]:text-surface",
      cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
      error:
        "group-[.toaster]:!bg-destructive-subtle group-[.toaster]:!text-red-700 group-[.toaster]:!border-red-300 [&>svg]:!text-red-500 dark:group-[.toaster]:!text-red-300 dark:group-[.toaster]:!border-red-500/25",
      success:
        "group-[.toaster]:!bg-green-50 group-[.toaster]:!text-green-700 group-[.toaster]:!border-green-300 [&>svg]:!text-green-500 dark:group-[.toaster]:!bg-green-950 dark:group-[.toaster]:!text-green-300 dark:group-[.toaster]:!border-green-500/25"
    }
  }}
  {...props}
/>
