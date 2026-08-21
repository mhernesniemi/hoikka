<script lang="ts">
  import { enhance } from "$app/forms";
  import type { ColumnDef } from "@tanstack/table-core";
  import { DataTable, renderSnippet, renderComponent } from "@hoikka/core/admin/data-table/index";
  import { Badge } from "@hoikka/core/admin/ui/badge/index";
  import { Button, buttonVariants } from "@hoikka/core/admin/ui/button/index";
  import DeleteConfirmDialog from "@hoikka/core/admin/DeleteConfirmDialog.svelte";
  import { Checkbox } from "@hoikka/core/admin/ui/checkbox/index";
  import type { load as __load } from "./page.server.js";
  type PageData = Awaited<ReturnType<typeof __load>>;
  import { Percent as PercentIcon } from "@lucide/svelte";
  import PlusIcon from "@lucide/svelte/icons/plus";
  import { BASE_CURRENCY, formatDate } from "@hoikka/core/shared/utils";

  let { data }: { data: PageData } = $props();

  let showBulkDelete = $state(false);
  let pendingDeleteIds = $state<number[]>([]);
  let bulkDeleteTable: { resetRowSelection: () => void } | null = null;

  type PromoRow = (typeof data.promotions)[number];

  function formatPrice(cents: number): string {
    return (cents / 100).toFixed(2);
  }

  function getPromotionStatus(promo: PromoRow) {
    if (!promo.enabled) return { label: "Disabled", variant: "secondary" as const };
    const now = new Date();
    if (promo.startsAt && promo.startsAt > now)
      return { label: "Scheduled", variant: "warning" as const };
    if (promo.endsAt && promo.endsAt < now)
      return { label: "Expired", variant: "destructive" as const };
    return { label: "Active", variant: "success" as const };
  }

  function getTypeLabel(type: string) {
    switch (type) {
      case "order":
        return "Amount off order";
      case "product":
        return "Amount off products";
      case "free_shipping":
        return "Free shipping";
      default:
        return type;
    }
  }

  function getDiscountLabel(promo: PromoRow) {
    if (promo.promotionType === "free_shipping") return "Free shipping";
    if (promo.discountType === "percentage") return `${promo.discountValue}%`;
    return `${formatPrice(promo.discountValue)} ${BASE_CURRENCY}`;
  }

  function formatDateOrDash(date: Date | null) {
    if (!date) return "-";
    return formatDate(date);
  }

  const columns: ColumnDef<PromoRow>[] = [
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
      accessorKey: "code",
      header: "Code / Title",
      cell: ({ row }) =>
        renderSnippet(codeCell, {
          code: row.original.code,
          title: row.original.title,
          method: row.original.method,
          id: row.original.id
        })
    },
    {
      id: "method",
      header: "Method",
      accessorFn: (row) => (row.method === "automatic" ? "Auto" : "Code"),
      cell: ({ row }) => renderSnippet(methodCell, { method: row.original.method })
    },
    {
      accessorKey: "promotionType",
      header: "Type",
      cell: ({ row }) => renderSnippet(typeCell, { type: row.original.promotionType })
    },
    {
      accessorFn: (row) => getDiscountLabel(row),
      id: "discount",
      header: "Discount"
    },
    {
      accessorFn: (row) => `${formatDateOrDash(row.startsAt)} - ${formatDateOrDash(row.endsAt)}`,
      id: "dates",
      header: "Active Dates"
    },
    {
      accessorFn: (row) => `${row.usageCount}${row.usageLimit ? ` / ${row.usageLimit}` : ""}`,
      id: "usage",
      header: "Usage"
    },
    {
      accessorFn: (row) => getPromotionStatus(row).label,
      id: "status",
      header: "Status",
      cell: ({ row }) => renderSnippet(statusCell, getPromotionStatus(row.original))
    }
  ];
</script>

{#snippet codeCell({
  code,
  title,
  method,
  id
}: {
  code: string | null;
  title: string | null;
  method: string;
  id: number;
})}
  <a href="/admin/promotions/{id}" class="font-medium hover:underline">
    {method === "automatic" ? title : code}
  </a>
{/snippet}

{#snippet methodCell({ method }: { method: string })}
  <Badge variant={method === "automatic" ? "default" : "secondary"}>
    {method === "automatic" ? "Auto" : "Code"}
  </Badge>
{/snippet}

{#snippet typeCell({ type }: { type: string })}
  <Badge variant="outline">{getTypeLabel(type)}</Badge>
{/snippet}

{#snippet statusCell({
  label,
  variant
}: {
  label: string;
  variant: "success" | "secondary" | "warning" | "destructive";
})}
  <Badge {variant}>{label}</Badge>
{/snippet}

<svelte:head><title>Promotions | Admin</title></svelte:head>

<div>
  <div class="mb-6 flex items-center justify-between">
    <div>
      <h1 class="text-2xl leading-[40px] font-bold">Promotions</h1>
    </div>
    {#if data.promotions.length > 0}
      <a href="/admin/promotions/new" class={buttonVariants()}
        ><PlusIcon class="h-4 w-4" /> Add Promotion</a
      >
    {/if}
  </div>

  <DataTable
    data={data.promotions}
    {columns}
    searchPlaceholder="Filter promotions..."
    enableRowSelection={true}
    emptyIcon={PercentIcon}
    emptyTitle="No promotions"
    emptyDescription="Get started by creating a new promotion."
    serverPagination={{
      total: data.pagination.total,
      page: data.currentPage,
      pageSize: 20
    }}
  >
    {#snippet bulkActions({ selectedRows, table })}
      <form
        method="POST"
        action="?/enableSelected"
        use:enhance={() => {
          return async ({ update }) => {
            table.resetRowSelection();
            await update();
          };
        }}
        class="inline"
      >
        {#each selectedRows as row}
          <input type="hidden" name="ids" value={row.id} />
        {/each}
        <Button type="submit" variant="outline" size="sm">
          Enable ({selectedRows.length})
        </Button>
      </form>
      <form
        method="POST"
        action="?/disableSelected"
        use:enhance={() => {
          return async ({ update }) => {
            table.resetRowSelection();
            await update();
          };
        }}
        class="inline"
      >
        {#each selectedRows as row}
          <input type="hidden" name="ids" value={row.id} />
        {/each}
        <Button type="submit" variant="outline" size="sm">
          Disable ({selectedRows.length})
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
    {/snippet}
    {#snippet emptyAction()}
      <a href="/admin/promotions/new" class={buttonVariants()}>Create promotion</a>
    {/snippet}
  </DataTable>
</div>

<DeleteConfirmDialog
  bind:open={showBulkDelete}
  title="Delete selected items?"
  description="Are you sure you want to delete {pendingDeleteIds.length} selected item(s)? This action cannot be undone."
  action="?/deleteSelected"
  ondeleted={() => bulkDeleteTable?.resetRowSelection()}
>
  {#each pendingDeleteIds as id}
    <input type="hidden" name="ids" value={id} />
  {/each}
</DeleteConfirmDialog>
