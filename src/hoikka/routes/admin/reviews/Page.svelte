<script lang="ts">
  import { enhance } from "$app/forms";
  import { toast } from "svelte-sonner";
  import type { ColumnDef } from "@tanstack/table-core";
  import { DataTable, renderSnippet, renderComponent } from "@hoikka/core/admin/data-table/index";
  import { Badge, type BadgeVariant } from "@hoikka/core/admin/ui/badge/index";
  import { Button } from "@hoikka/core/admin/ui/button/index";
  import DeleteConfirmDialog from "@hoikka/core/admin/DeleteConfirmDialog.svelte";
  import { Checkbox } from "@hoikka/core/admin/ui/checkbox/index";
  import type { load as __load } from "./page.server.js";
  type PageData = Awaited<ReturnType<typeof __load>>;
  type ActionData = Record<string, any> | null;
  import { cn, formatDate } from "@hoikka/core/shared/utils";

  let { data, form }: { data: PageData; form: ActionData } = $props();

  let showBulkDelete = $state(false);
  let pendingDeleteIds = $state<number[]>([]);
  let bulkDeleteTable: { resetRowSelection: () => void } | null = null;

  type ReviewRow = (typeof data.reviews)[number];

  const statuses = ["pending", "approved", "rejected"];

  $effect(() => {
    if (form?.error) toast.error(form.error);
  });

  function getProductName(review: ReviewRow): string {
    return review.product.name;
  }

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

  const columns: ColumnDef<ReviewRow>[] = [
    {
      id: "select",
      header: ({ table }) =>
        renderComponent(Checkbox, {
          checked: table.getIsAllPageRowsSelected(),
          indeterminate: table.getIsSomePageRowsSelected() && !table.getIsAllPageRowsSelected(),
          onCheckedChange: (value: boolean) => table.toggleAllPageRowsSelected(!!value),
          "aria-label": "Select all"
        }),
      cell: ({ row }) =>
        renderComponent(Checkbox, {
          checked: row.getIsSelected(),
          onCheckedChange: (value: boolean) => row.toggleSelected(!!value),
          "aria-label": "Select row"
        }),
      enableSorting: false
    },
    {
      accessorFn: (row) => row.comment ?? "-",
      id: "comment",
      header: "Comment",
      cell: ({ row }) =>
        renderSnippet(commentCell, { id: row.original.id, comment: row.original.comment })
    },
    {
      accessorFn: (row) => getProductName(row),
      id: "product",
      header: "Product"
    },
    {
      accessorKey: "nickname",
      header: "Nickname"
    },
    {
      accessorFn: (row) => (row.isVerifiedPurchase ? "Yes" : "No"),
      id: "verified",
      header: "Verified"
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => renderSnippet(statusCell, { status: row.original.status })
    },
    {
      accessorKey: "createdAt",
      header: "Date",
      cell: ({ row }) => formatDate(row.original.createdAt)
    }
  ];
</script>

{#snippet commentCell({ id, comment }: { id: number; comment: string | null })}
  <a href="/admin/reviews/{id}" class="inline-block max-w-xs truncate font-medium hover:underline">
    {comment ?? "-"}
  </a>
{/snippet}

{#snippet statusCell({ status }: { status: string })}
  <Badge variant={getStatusVariant(status)} class="capitalize">
    {status}
  </Badge>
{/snippet}

<svelte:head><title>Reviews | Admin</title></svelte:head>

<div>
  <div class="mb-6 flex items-center justify-between">
    <h1 class="text-2xl leading-[40px] font-bold">Reviews</h1>
  </div>

  <!-- Status Filter -->
  <div class="mb-6 flex flex-wrap gap-2">
    {#each [null, ...statuses] as status}
      {@const active = data.currentStatus === status}
      <a
        href="/admin/reviews{status ? `?status=${status}` : ''}"
        class={cn(
          "rounded-full px-3 py-1 text-sm capitalize",
          active
            ? "bg-blue-600 text-white dark:bg-blue-800"
            : "bg-muted-strong/50 text-foreground-secondary hover:text-black dark:hover:text-white"
        )}
      >
        {status ?? "All"}
      </a>
    {/each}
  </div>

  <DataTable
    data={data.reviews}
    {columns}
    searchPlaceholder="Filter reviews..."
    enableRowSelection={true}
    serverPagination={{
      total: data.pagination.total,
      page: data.currentPage,
      pageSize: 20
    }}
  >
    {#snippet bulkActions({ selectedRows, table })}
      <div class="flex gap-2">
        <form
          method="POST"
          action="?/bulkApprove"
          use:enhance={() => {
            return async ({ update }) => {
              table.resetRowSelection();
              await update();
            };
          }}
        >
          {#each selectedRows as row}
            <input type="hidden" name="ids" value={row.id} />
          {/each}
          <Button type="submit" variant="outline" size="sm">
            Approve ({selectedRows.length})
          </Button>
        </form>
        <form
          method="POST"
          action="?/bulkReject"
          use:enhance={() => {
            return async ({ update }) => {
              table.resetRowSelection();
              await update();
            };
          }}
        >
          {#each selectedRows as row}
            <input type="hidden" name="ids" value={row.id} />
          {/each}
          <Button type="submit" variant="outline" size="sm">
            Reject ({selectedRows.length})
          </Button>
        </form>
        <Button
          variant="destructive"
          size="sm"
          onclick={() => {
            pendingDeleteIds = selectedRows.map((r) => r.id);
            bulkDeleteTable = table;
            showBulkDelete = true;
          }}
        >
          Delete ({selectedRows.length})
        </Button>
      </div>
    {/snippet}
  </DataTable>
</div>

<DeleteConfirmDialog
  bind:open={showBulkDelete}
  title="Delete selected items?"
  description="Are you sure you want to delete {pendingDeleteIds.length} selected item(s)? This action cannot be undone."
  action="?/bulkDelete"
  ondeleted={() => bulkDeleteTable?.resetRowSelection()}
>
  {#each pendingDeleteIds as id}
    <input type="hidden" name="ids" value={id} />
  {/each}
</DeleteConfirmDialog>
