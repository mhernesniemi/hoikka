<script lang="ts">
  import { page } from "$app/state";
  import { cn } from "$lib/utils";
  import { toast } from "svelte-sonner";
  import type { ColumnDef } from "@tanstack/table-core";
  import { DataTable, renderSnippet, renderComponent } from "$lib/components/admin/data-table";
  import { Button } from "$lib/components/admin/ui/button";
  import CreateDialog from "$lib/components/admin/CreateDialog.svelte";
  import DeleteConfirmDialog from "$lib/components/admin/DeleteConfirmDialog.svelte";
  import { Checkbox } from "$lib/components/admin/ui/checkbox";
  import UsersRound from "@lucide/svelte/icons/users-round";
  import type { PageData, ActionData } from "./$types";
  import { formatDate } from "$lib/utils";
  import PlusIcon from "@lucide/svelte/icons/plus";

  let { data, form }: { data: PageData; form: ActionData } = $props();

  const activeTab = $derived(page.url.searchParams.get("tab") ?? "customers");

  // Customer bulk delete
  let showBulkDelete = $state(false);
  let pendingDeleteIds = $state<number[]>([]);
  let bulkDeleteTable: { resetRowSelection: () => void } | null = null;

  // Group create dialog
  let showCreateGroup = $state(false);

  // Group bulk delete
  let showGroupBulkDelete = $state(false);
  let pendingGroupDeleteIds = $state<number[]>([]);
  let bulkDeleteGroupTable: { resetRowSelection: () => void } | null = null;

  type CustomerRow = (typeof data.customers)[number];
  type GroupRow = (typeof data.groups)[number];

  $effect(() => {
    if (form?.error) toast.error(form.error);
  });

  const customerColumns: ColumnDef<CustomerRow>[] = [
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
      accessorFn: (row) => `${row.firstName} ${row.lastName}`,
      id: "name",
      header: "Customer",
      cell: ({ row }) =>
        renderSnippet(customerCell, {
          id: row.original.id,
          firstName: row.original.firstName,
          lastName: row.original.lastName
        })
    },
    {
      accessorKey: "email",
      header: "Email",
      cell: ({ row }) => row.original.email
    },
    {
      accessorFn: (row) => row.phone ?? "-",
      id: "phone",
      header: "Phone"
    },
    {
      accessorKey: "createdAt",
      header: "Joined",
      cell: ({ row }) => formatDate(row.original.createdAt)
    }
  ];

  const groupColumns: ColumnDef<GroupRow>[] = [
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
      accessorKey: "name",
      header: "Name",
      cell: ({ row }) =>
        renderSnippet(groupNameCell, { id: row.original.id, name: row.original.name })
    },
    {
      accessorFn: (row) => row.description ?? "-",
      id: "description",
      header: "Description"
    },
    {
      accessorKey: "customerCount",
      header: "Customers",
      cell: ({ row }) => String(row.original.customerCount)
    },
    {
      accessorKey: "createdAt",
      header: "Created",
      cell: ({ row }) => formatDate(row.original.createdAt)
    }
  ];
</script>

{#snippet customerCell({
  id,
  firstName,
  lastName
}: {
  id: number;
  firstName: string;
  lastName: string;
})}
  <a href="/admin/customers/{id}" class="font-medium hover:underline">
    {firstName}
    {lastName}
  </a>
{/snippet}

{#snippet groupNameCell({ id, name }: { id: number; name: string })}
  <a href="/admin/customers/groups/{id}" class="font-medium hover:underline">
    {name}
  </a>
{/snippet}

<svelte:head><title>Customers | Admin</title></svelte:head>

<div>
  <div class="mb-6 flex items-center justify-between">
    <h1 class="text-2xl leading-[40px] font-bold">Customers</h1>
    {#if activeTab === "groups" && data.groups.length > 0}
      <div class="flex items-center justify-end">
        <Button onclick={() => (showCreateGroup = true)}>
          <PlusIcon class="h-4 w-4" /> Add Group
        </Button>
      </div>
    {/if}
  </div>

  <!-- Tabs -->
  <div class="mb-6 border-b border-border">
    <div class="flex gap-8">
      <a
        href="/admin/customers"
        class={cn(
          "border-b-2 pb-3 text-sm font-medium transition-colors",
          activeTab === "customers"
            ? "border-blue-500 text-blue-600 dark:text-blue-400"
            : "border-transparent text-muted-foreground hover:border-input-border hover:text-foreground-secondary"
        )}
      >
        All Customers
      </a>
      <a
        href="/admin/customers?tab=groups"
        class={cn(
          "border-b-2 pb-3 text-sm font-medium transition-colors",
          activeTab === "groups"
            ? "border-blue-500 text-blue-600 dark:text-blue-400"
            : "border-transparent text-muted-foreground hover:border-input-border hover:text-foreground-secondary"
        )}
      >
        Customer Groups
      </a>
    </div>
  </div>

  <!-- Customers Tab -->
  {#if activeTab === "customers"}
    <DataTable
      data={data.customers}
      columns={customerColumns}
      searchPlaceholder="Filter customers..."
      enableRowSelection={true}
      serverPagination={data.tab === "customers"
        ? {
            total: data.customerPagination.total,
            page: data.currentPage,
            pageSize: 20
          }
        : undefined}
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
    </DataTable>
  {/if}

  <!-- Customer Groups Tab -->
  {#if activeTab === "groups"}
    <DataTable
      data={data.groups}
      columns={groupColumns}
      searchPlaceholder="Filter groups..."
      enableRowSelection={true}
      emptyIcon={UsersRound}
      emptyTitle="No customer groups"
      emptyDescription="Get started by creating a new customer group."
      serverPagination={data.tab === "groups"
        ? {
            total: data.groupPagination.total,
            page: data.currentPage,
            pageSize: 20
          }
        : undefined}
    >
      {#snippet bulkActions({ selectedRows, table })}
        <Button
          variant="destructive"
          size="sm"
          onclick={() => {
            pendingGroupDeleteIds = selectedRows.map((r) => r.id);
            bulkDeleteGroupTable = table;
            showGroupBulkDelete = true;
          }}
        >
          Delete ({selectedRows.length})
        </Button>
      {/snippet}
      {#snippet emptyAction()}
        <Button onclick={() => (showCreateGroup = true)}>Add Group</Button>
      {/snippet}
    </DataTable>
  {/if}
</div>

<CreateDialog
  bind:open={showCreateGroup}
  title="New Customer Group"
  action="?/createGroup"
  placeholder="e.g., Wholesale"
/>

<DeleteConfirmDialog
  bind:open={showBulkDelete}
  title="Delete selected customers?"
  description="Are you sure you want to delete {pendingDeleteIds.length} selected customer(s)? This action cannot be undone."
  action="?/deleteSelected"
  ondeleted={() => bulkDeleteTable?.resetRowSelection()}
>
  {#each pendingDeleteIds as id}
    <input type="hidden" name="ids" value={id} />
  {/each}
</DeleteConfirmDialog>

<DeleteConfirmDialog
  bind:open={showGroupBulkDelete}
  title="Delete selected groups?"
  description="Are you sure you want to delete {pendingGroupDeleteIds.length} selected group(s)? This action cannot be undone."
  action="?/deleteSelectedGroups"
  ondeleted={() => bulkDeleteGroupTable?.resetRowSelection()}
>
  {#each pendingGroupDeleteIds as id}
    <input type="hidden" name="ids" value={id} />
  {/each}
</DeleteConfirmDialog>
