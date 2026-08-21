<script lang="ts">
  import type { ColumnDef } from "@tanstack/table-core";
  import { DataTable, renderSnippet, renderComponent } from "@hoikka/core/admin/data-table/index";
  import { Badge } from "@hoikka/core/admin/ui/badge/index";
  import { Button } from "@hoikka/core/admin/ui/button/index";
  import DeleteConfirmDialog from "@hoikka/core/admin/DeleteConfirmDialog.svelte";
  import CreateDialog from "@hoikka/core/admin/CreateDialog.svelte";
  import { Checkbox } from "@hoikka/core/admin/ui/checkbox/index";
  import FolderOpen from "@lucide/svelte/icons/folder-open";
  import PlusIcon from "@lucide/svelte/icons/plus";
  import { formatDate } from "@hoikka/core/shared/utils";

  let { data } = $props();

  let showBulkDelete = $state(false);
  let pendingDeleteIds = $state<number[]>([]);
  let bulkDeleteTable: { resetRowSelection: () => void } | null = null;

  let createDialogOpen = $state(false);

  type CollectionRow = (typeof data.collections)[number];

  const columns: ColumnDef<CollectionRow>[] = [
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
      accessorFn: (row) => row.name,
      id: "name",
      header: "Collection",
      cell: ({ row }) =>
        renderSnippet(collectionCell, {
          name: row.original.name,
          id: row.original.id
        })
    },
    {
      accessorFn: (row) => row.productCount,
      id: "productCount",
      header: "Products",
      cell: ({ row }) => `${row.original.productCount} products`
    },
    {
      accessorFn: (row) => (row.isPrivate ? "Private" : "Public"),
      id: "status",
      header: "Status",
      cell: ({ row }) =>
        renderSnippet(statusCell, {
          isPrivate: row.original.isPrivate
        })
    },
    {
      accessorKey: "createdAt",
      header: "Created",
      cell: ({ row }) => formatDate(row.original.createdAt)
    }
  ];
</script>

{#snippet collectionCell({ name, id }: { name: string; id: number })}
  <a href="/admin/collections/{id}" class="font-medium hover:underline">
    {name}
  </a>
{/snippet}

{#snippet statusCell({ isPrivate }: { isPrivate: boolean })}
  {#if isPrivate}
    <Badge variant="outline">Private</Badge>
  {:else}
    <Badge variant="success">Public</Badge>
  {/if}
{/snippet}

<svelte:head><title>Collections | Admin</title></svelte:head>

<div>
  <div class="mb-6 flex items-center justify-between">
    <div>
      <h1 class="text-2xl leading-[40px] font-bold">Collections</h1>
    </div>
    {#if data.collections.length > 0}
      <Button type="button" onclick={() => (createDialogOpen = true)}>
        <PlusIcon class="h-4 w-4" /> Add Collection
      </Button>
    {/if}
  </div>

  <DataTable
    data={data.collections}
    {columns}
    searchPlaceholder="Filter collections..."
    enableRowSelection={true}
    emptyIcon={FolderOpen}
    emptyTitle="No collections"
    emptyDescription="Get started by creating a new collection."
    serverPagination={{
      total: data.pagination.total,
      page: data.currentPage,
      pageSize: 20
    }}
  >
    {#snippet bulkActions({ selectedRows, table })}
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
      <Button type="button" onclick={() => (createDialogOpen = true)}>Create Collection</Button>
    {/snippet}
  </DataTable>
</div>

<CreateDialog
  bind:open={createDialogOpen}
  title="New Collection"
  action="/admin/collections?/create"
  placeholder="e.g., Summer Sale"
/>

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
