<script lang="ts">
  import type { ColumnDef } from "@tanstack/table-core";
  import { DataTable, renderSnippet, renderComponent } from "$lib/components/admin/data-table";
  import { Button } from "$lib/components/admin/ui/button";
  import DeleteConfirmDialog from "$lib/components/admin/DeleteConfirmDialog.svelte";
  import CreateDialog from "$lib/components/admin/CreateDialog.svelte";
  import { Checkbox } from "$lib/components/admin/ui/checkbox";
  import Tag from "@lucide/svelte/icons/tag";
  import PlusIcon from "@lucide/svelte/icons/plus";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();

  let showBulkDelete = $state(false);
  let pendingDeleteIds = $state<number[]>([]);
  let bulkDeleteTable: { resetRowSelection: () => void } | null = null;

  let createDialogOpen = $state(false);

  type FacetRow = (typeof data.facets)[number];

  const columns: ColumnDef<FacetRow>[] = [
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
      header: "Name",
      cell: ({ row }) =>
        renderSnippet(nameCell, {
          id: row.original.id,
          name: row.original.name
        })
    },
    {
      accessorKey: "code",
      header: "Code"
    },
    {
      accessorFn: (row) => row.valueCount,
      id: "values",
      header: "Values",
      cell: ({ row }) =>
        `${row.original.valueCount} value${row.original.valueCount !== 1 ? "s" : ""}`
    }
  ];
</script>

{#snippet nameCell({ id, name }: { id: number; name: string })}
  <a href="/admin/facets/{id}" class="font-medium hover:underline">
    {name}
  </a>
{/snippet}

<svelte:head><title>Facets | Admin</title></svelte:head>

<div>
  <div class="mb-6 flex items-center justify-between">
    <div>
      <h1 class="text-2xl leading-[40px] font-bold">Facets</h1>
    </div>
    {#if data.facets.length > 0}
      <Button type="button" onclick={() => (createDialogOpen = true)}>
        <PlusIcon class="h-4 w-4" /> Add Facet
      </Button>
    {/if}
  </div>

  <DataTable
    data={data.facets}
    {columns}
    searchPlaceholder="Filter facets..."
    enableRowSelection={true}
    emptyIcon={Tag}
    emptyTitle="No facets"
    emptyDescription="Get started by creating a new facet."
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
      <Button type="button" onclick={() => (createDialogOpen = true)}>Add Facet</Button>
    {/snippet}
  </DataTable>
</div>

<CreateDialog
  bind:open={createDialogOpen}
  title="New Facet"
  action="/admin/facets?/create"
  placeholder="e.g., Color"
  fieldName="name"
  slugField="code"
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
