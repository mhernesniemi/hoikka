<script lang="ts">
  import type { ColumnDef } from "@tanstack/table-core";
  import { DataTable, renderSnippet } from "$lib/components/admin/data-table";
  import { Badge, type BadgeVariant } from "$lib/components/admin/ui/badge";
  import { cn, formatDateTime, orderStateLabel } from "$lib/utils";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();

  type OrderRow = (typeof data.orders)[0];

  const states = ["created", "payment_pending", "paid", "shipped", "delivered", "cancelled"];

  function getStateVariant(state: string): BadgeVariant {
    switch (state) {
      case "paid":
      case "delivered":
        return "success";
      case "shipped":
        return "default";
      case "cancelled":
        return "destructive";
      default:
        return "secondary";
    }
  }

  const columns: ColumnDef<OrderRow>[] = [
    {
      accessorKey: "code",
      header: "Order",
      cell: ({ row }) =>
        renderSnippet(orderCell, {
          code: row.original.code,
          itemCount: row.original.lines.length,
          id: row.original.id
        })
    },
    {
      accessorFn: (row) => row.shippingFullName ?? "Guest",
      id: "customer",
      header: "Customer"
    },
    {
      accessorKey: "state",
      header: "Status",
      cell: ({ row }) => renderSnippet(statusCell, { state: row.original.state })
    },
    {
      accessorKey: "total",
      header: "Total",
      cell: ({ row }) => `${(row.original.total / 100).toFixed(2)} ${row.original.currencyCode}`
    },
    {
      accessorFn: (row) => row.orderPlacedAt ?? row.createdAt,
      id: "date",
      header: "Date",
      cell: ({ row }) => formatDateTime(row.original.orderPlacedAt ?? row.original.createdAt)
    }
  ];
</script>

{#snippet orderCell({ code, itemCount, id }: { code: string; itemCount: number; id: number })}
  <a href="/admin/orders/{id}" class="group inline-block font-medium">
    <p class="group-hover:underline">{code}</p>
    <p class="text-sm text-muted-foreground">{itemCount} items</p>
  </a>
{/snippet}

{#snippet statusCell({ state }: { state: string })}
  <Badge variant={getStateVariant(state)}>
    {orderStateLabel(state)}
  </Badge>
{/snippet}

<svelte:head><title>Orders | Admin</title></svelte:head>

<div>
  <div class="mb-6 flex items-center justify-between">
    <h1 class="text-2xl leading-[40px] font-bold">Orders</h1>
  </div>

  <!-- State Filter -->
  <div class="mb-6 flex flex-wrap gap-2">
    {#each [null, ...states] as state}
      {@const active = data.currentState === state}
      <a
        href="/admin/orders{state ? `?state=${state}` : ''}"
        class={cn(
          "rounded-full px-3 py-1 text-sm capitalize",
          active
            ? "bg-blue-600 text-white dark:bg-blue-800"
            : "bg-muted-strong/50 text-foreground-secondary hover:text-black dark:hover:text-white"
        )}
      >
        {state ? orderStateLabel(state) : "All"}
      </a>
    {/each}
  </div>

  <DataTable data={data.orders} {columns} searchPlaceholder="Filter orders..." pageSize={20} />
</div>
