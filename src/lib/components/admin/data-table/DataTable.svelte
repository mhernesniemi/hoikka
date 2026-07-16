<script lang="ts" generics="TData extends { id: number | string }">
  import type {
    ColumnDef,
    SortingState,
    RowSelectionState,
    PaginationState,
    Table
  } from "@tanstack/table-core";
  import {
    getCoreRowModel,
    getSortedRowModel,
    getFilteredRowModel,
    getPaginationRowModel
  } from "@tanstack/table-core";
  import { createSvelteTable, FlexRender } from "$lib/components/admin/ui/data-table/index.js";
  import {
    Table as TableRoot,
    TableHeader,
    TableBody,
    TableRow,
    TableHead,
    TableCell
  } from "$lib/components/admin/ui/table/index.js";
  import { Input } from "$lib/components/admin/ui/input/index.js";
  import { Button } from "$lib/components/admin/ui/button/index.js";
  import DataTableColumnHeader from "./DataTableColumnHeader.svelte";
  import { cn } from "$lib/utils";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import Search from "@lucide/svelte/icons/search";
  import type { Snippet, Component } from "svelte";

  let {
    columns,
    data,
    searchPlaceholder = "Search...",
    enableRowSelection = false,
    bulkActions,
    emptyIcon,
    emptyTitle = "No results",
    emptyDescription = "",
    emptyAction,
    pageSize = 20,
    serverPagination
  }: {
    columns: ColumnDef<TData, unknown>[];
    data: TData[];
    searchPlaceholder?: string;
    enableRowSelection?: boolean;
    bulkActions?: Snippet<[{ selectedRows: TData[]; table: Table<TData> }]>;
    emptyIcon?: Component;
    emptyTitle?: string;
    emptyDescription?: string;
    emptyAction?: Snippet;
    pageSize?: number;
    serverPagination?: { total: number; page: number; pageSize: number };
  } = $props();

  // Initialize sorting from URL when server-paginated
  const urlSort = serverPagination ? page.url.searchParams.get("sort") : null;
  const urlOrder = serverPagination ? page.url.searchParams.get("order") : null;
  let sorting = $state<SortingState>(urlSort ? [{ id: urlSort, desc: urlOrder !== "asc" }] : []);
  let globalFilter = $state("");
  let rowSelection = $state<RowSelectionState>({});
  let pagination = $state<PaginationState>({ pageIndex: 0, pageSize });

  // Server-side search: read initial value from URL and debounce navigation
  let serverSearchValue = $state(page.url.searchParams.get("search") ?? "");
  let searchDebounceTimer: ReturnType<typeof setTimeout> | undefined;

  function handleServerSearch(value: string) {
    serverSearchValue = value;
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(() => {
      const url = new URL(page.url);
      if (value) {
        url.searchParams.set("search", value);
      } else {
        url.searchParams.delete("search");
      }
      url.searchParams.delete("page");
      goto(url.toString(), { keepFocus: true });
    }, 300);
  }

  const table = createSvelteTable({
    get data() {
      return data;
    },
    get columns() {
      return columns;
    },
    state: {
      get sorting() {
        return sorting;
      },
      get globalFilter() {
        return globalFilter;
      },
      get rowSelection() {
        return rowSelection;
      },
      get pagination() {
        return pagination;
      }
    },
    onSortingChange: (updater) => {
      const newSorting = typeof updater === "function" ? updater(sorting) : updater;
      sorting = newSorting;
      if (serverPagination) {
        const url = new URL(page.url);
        if (newSorting.length > 0) {
          url.searchParams.set("sort", newSorting[0].id);
          url.searchParams.set("order", newSorting[0].desc ? "desc" : "asc");
        } else {
          url.searchParams.delete("sort");
          url.searchParams.delete("order");
        }
        url.searchParams.delete("page");
        goto(url.toString());
      }
    },
    onGlobalFilterChange: (updater) => {
      globalFilter = typeof updater === "function" ? updater(globalFilter) : updater;
    },
    onRowSelectionChange: (updater) => {
      rowSelection = typeof updater === "function" ? updater(rowSelection) : updater;
    },
    onPaginationChange: (updater) => {
      pagination = typeof updater === "function" ? updater(pagination) : updater;
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    get manualSorting() {
      return !!serverPagination;
    },
    get manualPagination() {
      return !!serverPagination;
    },
    get pageCount() {
      return serverPagination ? Math.ceil(serverPagination.total / serverPagination.pageSize) : -1;
    },
    get enableRowSelection() {
      return enableRowSelection;
    },
    getRowId: (row) => String(row.id)
  });

  let selectedCount = $derived(table.getFilteredSelectedRowModel().rows.length);
  let selectedRows = $derived(table.getFilteredSelectedRowModel().rows.map((r) => r.original));
  let totalFiltered = $derived(
    serverPagination ? serverPagination.total : table.getFilteredRowModel().rows.length
  );
  let pageCount = $derived(
    serverPagination
      ? Math.ceil(serverPagination.total / serverPagination.pageSize)
      : table.getPageCount()
  );
  let showingFrom = $derived(
    serverPagination
      ? (serverPagination.page - 1) * serverPagination.pageSize + 1
      : pagination.pageIndex * pagination.pageSize + 1
  );
  let showingTo = $derived(
    serverPagination
      ? Math.min(serverPagination.page * serverPagination.pageSize, serverPagination.total)
      : Math.min((pagination.pageIndex + 1) * pagination.pageSize, totalFiltered)
  );

  function goToServerPage(newPage: number) {
    const url = new URL(page.url);
    if (newPage <= 1) {
      url.searchParams.delete("page");
    } else {
      url.searchParams.set("page", String(newPage));
    }
    goto(url.toString());
  }

  let serverPage = $derived(serverPagination?.page ?? 1);
  let canPrevServer = $derived(serverPage > 1);
  let canNextServer = $derived(serverPagination ? serverPage < pageCount : false);
</script>

<!-- Table or empty state -->
{#if data.length === 0 && emptyIcon}
  <div class="mt-2 mb-6 rounded-lg border border-dashed border-input-border p-12 text-center">
    {#if emptyIcon}
      {@const Icon = emptyIcon}
      <Icon class="mx-auto h-12 w-12 text-placeholder" />
    {/if}
    <h3 class="mt-2 text-sm font-medium">{emptyTitle}</h3>
    {#if emptyDescription}
      <p class="mt-1 text-sm text-muted-foreground">{emptyDescription}</p>
    {/if}
    {#if emptyAction}
      <div class="mt-6">
        {@render emptyAction()}
      </div>
    {/if}
  </div>
{:else}
  <!-- Toolbar: search + bulk actions -->
  <div class="flex items-center justify-between gap-4 pt-1 pb-4">
    <div class="relative max-w-sm flex-1">
      <Search class="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-placeholder" />
      {#if serverPagination}
        <Input
          id="table-search"
          placeholder={searchPlaceholder}
          value={serverSearchValue}
          oninput={(e: Event) => handleServerSearch((e.target as HTMLInputElement).value)}
          class="pl-9"
        />
      {:else}
        <Input
          id="table-search"
          placeholder={searchPlaceholder}
          value={globalFilter}
          oninput={(e: Event) => table.setGlobalFilter((e.target as HTMLInputElement).value)}
          class="pl-9"
        />
      {/if}
    </div>

    {#if bulkActions && selectedCount > 0}
      <div class="flex items-center gap-2">
        <span class="text-sm text-muted-foreground">{selectedCount} selected</span>
        {@render bulkActions({ selectedRows, table })}
      </div>
    {/if}
  </div>

  <TableRoot>
    <TableHeader>
      {#each table.getHeaderGroups() as headerGroup (headerGroup.id)}
        <TableRow class="hover:bg-transparent">
          {#each headerGroup.headers as header (header.id)}
            <TableHead colspan={header.colSpan} class={cn(header.id === "select" && "w-10")}>
              <DataTableColumnHeader {header} />
            </TableHead>
          {/each}
        </TableRow>
      {/each}
    </TableHeader>
    <TableBody>
      {#each table.getRowModel().rows as row (row.id)}
        <TableRow data-state={row.getIsSelected() ? "selected" : undefined}>
          {#each row.getVisibleCells() as cell, i (cell.id)}
            {@const isFirstDataCol =
              cell.column.id !== "select" &&
              (i === 0 || (i === 1 && row.getVisibleCells()[0]?.column.id === "select"))}
            <TableCell
              class={isFirstDataCol || cell.column.id === "select"
                ? ""
                : "text-foreground-secondary"}
            >
              <FlexRender content={cell.column.columnDef.cell} context={cell.getContext()} />
            </TableCell>
          {/each}
        </TableRow>
      {:else}
        <TableRow class="hover:bg-transparent">
          <TableCell colspan={columns.length} class="py-12 text-center text-muted-foreground">
            No results found
          </TableCell>
        </TableRow>
      {/each}
    </TableBody>
  </TableRoot>

  <!-- Pagination -->
  {#if pageCount > 1}
    <div class="mt-4 flex items-center justify-end gap-8">
      <div class="text-sm text-muted-foreground">
        Showing {showingFrom} to {showingTo} of {totalFiltered}
      </div>
      <div class="flex gap-2">
        {#if serverPagination}
          <Button
            variant="outline"
            size="sm"
            disabled={!canPrevServer}
            onclick={() => goToServerPage(serverPage - 1)}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!canNextServer}
            onclick={() => goToServerPage(serverPage + 1)}
          >
            Next
          </Button>
        {:else}
          <Button
            variant="outline"
            size="sm"
            disabled={!table.getCanPreviousPage()}
            onclick={() => table.previousPage()}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!table.getCanNextPage()}
            onclick={() => table.nextPage()}
          >
            Next
          </Button>
        {/if}
      </div>
    </div>
  {/if}

  <!-- Selection count (when row selection enabled) -->
  {#if enableRowSelection && selectedCount > 0}
    <div class="mt-2 text-sm text-muted-foreground">
      {selectedCount} of {totalFiltered} row(s) selected
    </div>
  {/if}
{/if}
