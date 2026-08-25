<script lang="ts">
  import PageActionsMenu from "$lib/components/admin/PageActionsMenu.svelte";
  import { enhance } from "$app/forms";
  import { cn } from "$lib/utils";
  import { page } from "$app/state";
  import { onMount } from "svelte";
  import { toast } from "svelte-sonner";
  import { Button } from "$lib/components/admin/ui/button";
  import { Checkbox } from "$lib/components/admin/ui/checkbox";
  import { Input } from "$lib/components/admin/ui/input";
  import { Label } from "$lib/components/admin/ui/label";
  import * as Popover from "$lib/components/admin/ui/popover";
  import * as Command from "$lib/components/admin/ui/command";
  import DeleteConfirmDialog from "$lib/components/admin/DeleteConfirmDialog.svelte";
  import AdminCard from "$lib/components/admin/AdminCard.svelte";
  import ChevronsUpDown from "@lucide/svelte/icons/chevrons-up-down";
  import Check from "@lucide/svelte/icons/check";
  import ChevronLeft from "@lucide/svelte/icons/chevron-left";
  import Trash2 from "@lucide/svelte/icons/trash-2";
  import UnsavedChangesDialog from "$lib/components/admin/UnsavedChangesDialog.svelte";
  import type { PageData, ActionData } from "./$types";

  let { data, form }: { data: PageData; form: ActionData } = $props();

  let isSubmitting = $state(false);
  let showDelete = $state(false);
  let comboboxOpen = $state(false);
  let selectedCustomerIds = $state<Set<number>>(new Set());

  onMount(() => {
    if (page.url.searchParams.has("created")) {
      toast.success("Customer group created successfully");
      history.replaceState({}, "", page.url.pathname);
    }
  });

  $effect(() => {
    if (form?.error) toast.error(form.error);
  });

  let groupName = $state("");
  let groupDescription = $state("");
  let isTaxExempt = $state(false);

  type CustomerEntry = {
    id: number;
    firstName: string;
    lastName: string;
    email: string;
  };

  let customers = $state<CustomerEntry[]>([]);

  $effect(() => {
    groupName = data.group.name;
    groupDescription = data.group.description ?? "";
    isTaxExempt = data.group.isTaxExempt;
    customers = data.groupCustomers.map((c) => ({
      id: c.id,
      firstName: c.firstName,
      lastName: c.lastName,
      email: c.email
    }));
  });

  const hasUnsavedChanges = $derived.by(() => {
    return (
      groupName !== data.group.name ||
      groupDescription !== (data.group.description ?? "") ||
      isTaxExempt !== data.group.isTaxExempt ||
      customers
        .map((c) => c.id)
        .sort()
        .join() !==
        data.groupCustomers
          .map((c) => c.id)
          .sort()
          .join()
    );
  });

  const customerIdsInGroup = $derived(new Set(customers.map((c) => c.id)));
  const availableCustomers = $derived(
    data.allCustomers.filter((c) => !customerIdsInGroup.has(c.id))
  );

  const selectedCustomerLabel = $derived(() => {
    if (selectedCustomerIds.size === 0) return "Select customers...";
    return `${selectedCustomerIds.size} customer${selectedCustomerIds.size !== 1 ? "s" : ""} selected`;
  });

  function toggleCustomerSelection(id: number) {
    const next = new Set(selectedCustomerIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    selectedCustomerIds = next;
  }

  function addSelectedCustomers() {
    if (selectedCustomerIds.size === 0) return;
    const newCustomers = data.allCustomers
      .filter((c) => selectedCustomerIds.has(c.id))
      .map((c) => ({
        id: c.id,
        firstName: c.firstName,
        lastName: c.lastName,
        email: c.email
      }));
    customers = [...customers, ...newCustomers].sort((a, b) =>
      `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`)
    );
    selectedCustomerIds = new Set();
  }

  function removeCustomer(id: number) {
    customers = customers.filter((c) => c.id !== id);
  }
</script>

<svelte:head><title>{data.group.name} | Customer Groups | Admin</title></svelte:head>

<div class="space-y-6">
  <div class="mb-6 flex items-center justify-between">
    <a
      href="/admin/customers?tab=groups"
      class="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline dark:text-blue-400"
      ><ChevronLeft class="h-4 w-4" /> Back to Customer Groups</a
    >
  </div>
  <div class="flex items-center justify-between">
    <h1 class="text-2xl font-bold">{data.group.name}</h1>
    <div class="flex items-center gap-2">
      <Button type="submit" form="group-form" disabled={isSubmitting}>
        {isSubmitting ? "Saving..." : "Save Changes"}
      </Button>
      <PageActionsMenu deleteLabel="Delete this group" ondelete={() => (showDelete = true)} />
    </div>
  </div>

  <div class="flex flex-col gap-6 lg:flex-row">
    <!-- Main Content -->
    <div class="flex-1 space-y-6">
      <!-- Edit Group -->
      <form
        id="group-form"
        method="POST"
        action="?/update"
        use:enhance={() => {
          isSubmitting = true;
          return async ({ result, update }) => {
            await update({ reset: false });
            isSubmitting = false;
            if (result.type === "success") {
              toast.success("Group updated");
            }
          };
        }}
      >
        <AdminCard title="Group Details">
          <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label for="group_name">Name</Label>
              <Input type="text" id="group_name" name="name" bind:value={groupName} required />
            </div>
            <div>
              <Label for="group_description">Description</Label>
              <Input
                type="text"
                id="group_description"
                name="description"
                bind:value={groupDescription}
                placeholder="Optional"
              />
            </div>
          </div>
          <input type="hidden" name="isTaxExempt" value={isTaxExempt ? "true" : "false"} />
          {#each customers as customer}
            <input type="hidden" name="customerIds" value={customer.id} />
          {/each}
        </AdminCard>
      </form>

      <!-- Customers Section -->
      <AdminCard title="Customers" noPadding>
        {#snippet headerExtra()}
          <div class="border-b border-border px-6 py-4">
            <p class="text-sm text-foreground-tertiary">
              {#if availableCustomers.length === 0 && customers.length > 0}
                All customers have been added to this group.
              {:else}
                Add customers to this group.
              {/if}
            </p>
            {#if availableCustomers.length > 0}
              <div class="mt-3 flex gap-2">
                <Popover.Root bind:open={comboboxOpen}>
                  <Popover.Trigger
                    class="flex h-9 w-full items-center justify-between rounded-lg border border-input-border bg-surface px-3 py-2 text-sm hover:bg-hover"
                  >
                    <span
                      class={selectedCustomerIds.size > 0
                        ? "text-foreground"
                        : "text-muted-foreground"}
                    >
                      {selectedCustomerLabel()}
                    </span>
                    <ChevronsUpDown class="ml-2 h-4 w-4 shrink-0 text-placeholder" />
                  </Popover.Trigger>
                  <Popover.Content class="w-[var(--bits-popover-trigger-width)] p-0" align="start">
                    <Command.Root>
                      <Command.Input placeholder="Search customers..." />
                      <Command.List class="max-h-60">
                        <Command.Empty>No customers found.</Command.Empty>
                        {#each availableCustomers as customer}
                          <Command.Item
                            value="{customer.firstName} {customer.lastName} {customer.email}"
                            onSelect={() => toggleCustomerSelection(customer.id)}
                          >
                            <Check
                              class={cn(
                                "mr-2 h-4 w-4",
                                selectedCustomerIds.has(customer.id) ? "opacity-100" : "opacity-0"
                              )}
                            />
                            <span>
                              {customer.firstName}
                              {customer.lastName}
                              <span class="text-muted-foreground">({customer.email})</span>
                            </span>
                          </Command.Item>
                        {/each}
                      </Command.List>
                    </Command.Root>
                  </Popover.Content>
                </Popover.Root>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={selectedCustomerIds.size === 0}
                  onclick={addSelectedCustomers}
                  class="shrink-0"
                >
                  Add{#if selectedCustomerIds.size > 0}
                    ({selectedCustomerIds.size}){/if}
                </Button>
              </div>
            {/if}
          </div>
        {/snippet}
        {#if customers.length === 0}
          <div class="p-12 text-center">
            <p class="text-sm text-muted-foreground">No customers in this group yet.</p>
          </div>
        {:else}
          <div>
            {#each customers as customer}
              <div
                class="flex items-center border-b border-border px-6 py-2.5 last:border-b-0 hover:bg-hover"
              >
                <div class="flex min-w-0 flex-1 items-center gap-3">
                  <a
                    href="/admin/customers/{customer.id}"
                    class="text-sm font-medium hover:underline"
                  >
                    {customer.firstName}
                    {customer.lastName}
                  </a>
                  <span class="text-sm text-placeholder">{customer.email}</span>
                </div>
                <div class="flex shrink-0 items-center pl-4">
                  <button
                    type="button"
                    class="group flex h-7 w-7 items-center justify-center rounded-md hover:bg-foreground/10"
                    title="Remove customer"
                    onclick={() => removeCustomer(customer.id)}
                  >
                    <Trash2 class="h-3.5 w-3.5 text-muted-foreground group-hover:text-foreground" />
                  </button>
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </AdminCard>
    </div>

    <!-- Sidebar -->
    <div class="w-full space-y-6 lg:w-80 lg:shrink-0">
      <!-- Tax Exempt -->
      <AdminCard title="Tax" variant="sidebar">
        <div class="flex items-center gap-2">
          <Checkbox id="is_tax_exempt" bind:checked={isTaxExempt} />
          <label for="is_tax_exempt" class="text-sm font-medium"> Tax exempt </label>
        </div>
        <p class="mt-2 text-xs text-muted-foreground">
          Customers in this group will not be charged VAT
        </p>
      </AdminCard>
    </div>
  </div>
</div>

<UnsavedChangesDialog isDirty={() => hasUnsavedChanges} isSaving={() => isSubmitting} />

<DeleteConfirmDialog
  bind:open={showDelete}
  title="Delete Group?"
  description="Are you sure you want to delete this customer group? This action cannot be undone."
/>
