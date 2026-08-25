<script lang="ts">
  import PageActionsMenu from "$lib/components/admin/PageActionsMenu.svelte";
  import { enhance } from "$app/forms";
  import { cn } from "$lib/utils";
  import { toast } from "svelte-sonner";
  import { Badge, type BadgeVariant } from "$lib/components/admin/ui/badge";
  import { Button } from "$lib/components/admin/ui/button";
  import AdminCard from "$lib/components/admin/AdminCard.svelte";
  import DeleteConfirmDialog from "$lib/components/admin/DeleteConfirmDialog.svelte";
  import ChevronLeft from "@lucide/svelte/icons/chevron-left";
  import type { PageData, ActionData } from "./$types";
  import { formatDate } from "$lib/utils";

  let { data, form }: { data: PageData; form: ActionData } = $props();

  let showDelete = $state(false);

  $effect(() => {
    if (form?.success) toast.success(form.message || "Success");
    if (form?.error) toast.error(form.error);
  });

  function getStatusVariant(status: string): BadgeVariant {
    switch (status) {
      case "approved":
        return "success";
      case "rejected":
        return "destructive";
      default:
        return "secondary";
    }
  }

  function formatRating(rating: number): string {
    return "\u2605".repeat(rating) + "\u2606".repeat(5 - rating);
  }
</script>

<svelte:head><title>Review #{data.review.id} | Admin</title></svelte:head>

<div class="space-y-6">
  <div class="mb-6 flex items-center justify-between">
    <a
      href="/admin/reviews"
      class="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline dark:text-blue-400"
      ><ChevronLeft class="h-4 w-4" /> Back to Reviews</a
    >
  </div>
  <div class="flex items-center justify-between">
    <div class="flex items-center gap-4">
      <h1 class="text-2xl font-bold">Review #{data.review.id}</h1>
      <Badge variant={getStatusVariant(data.review.status)} class="capitalize">
        {data.review.status}
      </Badge>
    </div>
    <PageActionsMenu deleteLabel="Delete this review" ondelete={() => (showDelete = true)} />
  </div>

  <div class="flex flex-col gap-6 lg:flex-row">
    <!-- Main Content -->
    <div class="flex-1 space-y-6">
      <!-- Review Content -->
      <AdminCard title="Review">
        <div class="mb-6">
          <h3 class="mb-1 text-sm font-medium text-foreground-secondary">Rating</h3>
          <span class="text-2xl text-yellow-500">{formatRating(data.review.rating)}</span>
        </div>

        <div>
          <h3 class="mb-1 text-sm font-medium text-foreground-secondary">Comment</h3>
          {#if data.review.comment}
            <p class="whitespace-pre-wrap">{data.review.comment}</p>
          {:else}
            <p class="text-placeholder">No comment</p>
          {/if}
        </div>
      </AdminCard>

      <!-- Moderation -->
      <AdminCard title="Moderation">
        <div class="flex items-center gap-3">
          {#if data.review.status !== "approved"}
            <form method="POST" action="?/approve" use:enhance>
              <Button type="submit">Approve</Button>
            </form>
          {/if}
          {#if data.review.status !== "rejected"}
            <form method="POST" action="?/reject" use:enhance>
              <Button type="submit" variant="outline">Reject</Button>
            </form>
          {/if}
          {#if data.review.status === "approved" || data.review.status === "rejected"}
            <span class="text-sm text-foreground-tertiary">
              This review is currently <span class="font-medium">{data.review.status}</span>.
            </span>
          {/if}
        </div>
      </AdminCard>
    </div>

    <!-- Sidebar -->
    <div class="w-full space-y-6 lg:w-96 lg:shrink-0">
      <!-- Details -->
      <AdminCard title="Details" variant="sidebar">
        <div class="space-y-3 text-sm">
          <div>
            <span class="text-foreground-secondary">Product</span>
            {#if data.product}
              <p>
                <a
                  href="/admin/products/{data.product.id}"
                  class="font-medium text-blue-600 hover:text-blue-800 dark:text-blue-400"
                >
                  {data.product.name ?? "Unknown product"}
                </a>
              </p>
            {:else}
              <p class="text-placeholder">Deleted product</p>
            {/if}
          </div>
          <div>
            <span class="text-foreground-secondary">Customer</span>
            {#if data.customer}
              <p>
                <a
                  href="/admin/customers/{data.customer.id}"
                  class="font-medium text-blue-600 hover:text-blue-800 dark:text-blue-400"
                >
                  {data.customer.firstName}
                  {data.customer.lastName}
                </a>
              </p>
            {:else}
              <p class="text-placeholder">Deleted customer</p>
            {/if}
          </div>
          <div>
            <span class="text-foreground-secondary">Verified purchase</span>
            <p class={cn("font-medium", data.review.isVerifiedPurchase && "text-green-600")}>
              {data.review.isVerifiedPurchase ? "Yes" : "No"}
            </p>
          </div>
          <div>
            <span class="text-foreground-secondary">Submitted by</span>
            <p class="font-medium">{data.review.nickname}</p>
          </div>
          <div>
            <span class="text-foreground-secondary">Date</span>
            <p class="font-medium">{formatDate(data.review.createdAt)}</p>
          </div>
        </div>
      </AdminCard>
    </div>
  </div>
</div>

<DeleteConfirmDialog
  bind:open={showDelete}
  title="Delete Review?"
  description="Are you sure you want to delete this review? This action cannot be undone."
/>
