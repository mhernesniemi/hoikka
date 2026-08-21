<script lang="ts">
  import { enhance } from "$app/forms";
  import type { ColumnDef } from "@tanstack/table-core";
  import { DataTable, renderSnippet, renderComponent } from "@hoikka/core/admin/data-table/index";
  import { Button } from "@hoikka/core/admin/ui/button/index";
  import CreateDialog from "@hoikka/core/admin/CreateDialog.svelte";
  import DeleteConfirmDialog from "@hoikka/core/admin/DeleteConfirmDialog.svelte";
  import { Checkbox } from "@hoikka/core/admin/ui/checkbox/index";
  import FileText from "@lucide/svelte/icons/file-text";
  import type { load as __load } from "./page.server.js";
  type PageData = Awaited<ReturnType<typeof __load>>;
  import { Badge } from "@hoikka/core/admin/ui/badge/index";
  import { formatDate } from "@hoikka/core/shared/utils";
  import PlusIcon from "@lucide/svelte/icons/plus";

  let { data }: { data: PageData } = $props();

  let showCreatePage = $state(false);
  let showBulkDelete = $state(false);
  let pendingDeleteIds = $state<number[]>([]);
  let bulkDeleteTable: { resetRowSelection: () => void } | null = null;

  type PageRow = (typeof data.pages)[number];

  const columns: ColumnDef<PageRow>[] = [
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
      accessorFn: (row) => row.title,
      id: "title",
      header: "Title",
      cell: ({ row }) =>
        renderSnippet(titleCell, {
          id: row.original.id,
          title: row.original.title
        })
    },
    {
      accessorFn: (row) => row.slug,
      id: "slug",
      header: "Slug"
    },
    {
      accessorKey: "published",
      header: "Published",
      cell: ({ row }) => renderSnippet(publishedCell, { published: row.original.published })
    },
    {
      accessorKey: "createdAt",
      header: "Created",
      cell: ({ row }) => formatDate(row.original.createdAt)
    }
  ];
</script>

{#snippet titleCell({ id, title }: { id: number; title: string })}
  <a href="/admin/content-pages/{id}" class="font-medium hover:underline">
    {title || "Untitled"}
  </a>
{/snippet}

{#snippet publishedCell({ published }: { published: boolean })}
  {#if published}
    <Badge variant="success">Published</Badge>
  {:else}
    <Badge variant="secondary">Draft</Badge>
  {/if}
{/snippet}

<svelte:head><title>Content Pages | Admin</title></svelte:head>

<div>
  <div class="mb-6 flex items-center justify-between">
    <div>
      <h1 class="text-2xl leading-[40px] font-bold">Content Pages</h1>
    </div>
    {#if data.pages.length > 0}
      <Button onclick={() => (showCreatePage = true)}><PlusIcon class="h-4 w-4" /> Add Page</Button>
    {/if}
  </div>

  <DataTable
    data={data.pages}
    {columns}
    searchPlaceholder="Filter pages..."
    enableRowSelection={true}
    emptyIcon={FileText}
    emptyTitle="No content pages"
    emptyDescription="Get started by creating a new page."
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
          action="?/publish"
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
            Publish ({selectedRows.length})
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
    {#snippet emptyAction()}
      <Button onclick={() => (showCreatePage = true)}>Create Page</Button>
    {/snippet}
  </DataTable>
</div>

<CreateDialog
  bind:open={showCreatePage}
  title="New Content Page"
  action="?/createPage"
  placeholder="e.g., About Us"
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
