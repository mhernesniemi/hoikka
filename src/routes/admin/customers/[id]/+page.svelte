<script lang="ts">
  import { enhance } from "$app/forms";
  import { toast } from "svelte-sonner";
  import {
    Table,
    TableHeader,
    TableBody,
    TableRow,
    TableHead,
    TableCell
  } from "$lib/components/admin/ui/table";
  import { Badge, type BadgeVariant } from "$lib/components/admin/ui/badge";
  import { Button } from "$lib/components/admin/ui/button";
  import { Input } from "$lib/components/admin/ui/input";
  import { Label } from "$lib/components/admin/ui/label";
  import ChevronLeft from "@lucide/svelte/icons/chevron-left";
  import AdminCard from "$lib/components/admin/AdminCard.svelte";
  import type { PageData, ActionData } from "./$types";
  import { BASE_CURRENCY, formatDate } from "$lib/utils";

  let { data, form }: { data: PageData; form: ActionData } = $props();

  let vatId = $state(data.customer.vatId ?? "");

  $effect(() => {
    vatId = data.customer.vatId ?? "";
  });

  $effect(() => {
    if (form?.success) toast.success(form.message || "Saved");
    if (form?.error) toast.error(form.error);
  });

  function formatPrice(cents: number): string {
    return (cents / 100).toFixed(2);
  }

  function getStateVariant(state: string): BadgeVariant {
    switch (state) {
      case "delivered":
        return "success";
      case "shipped":
      case "paid":
        return "default";
      case "cancelled":
        return "destructive";
      default:
        return "secondary";
    }
  }
</script>

<svelte:head><title>Customer Details | Admin</title></svelte:head>

<div class="space-y-6">
  <div class="mb-6">
    <a
      href="/admin/customers"
      class="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline dark:text-blue-400"
      ><ChevronLeft class="h-4 w-4" /> Back to Customers</a
    >
  </div>
  <h1 class="text-2xl font-bold">
    {data.customer.firstName}
    {data.customer.lastName}
  </h1>

  <div class="flex flex-col gap-6 lg:flex-row">
    <!-- Main Content (Left) -->
    <div class="flex-1 space-y-6">
      <!-- Addresses Section -->
      <AdminCard title="Addresses">
        {#if data.customer.addresses.length === 0}
          <p class="text-sm text-muted-foreground">No addresses saved</p>
        {:else}
          <div class="space-y-4">
            {#each data.customer.addresses as address}
              <div class="relative rounded-lg border border-border p-4">
                {#if address.isDefault}
                  <Badge class="absolute top-2 right-2">Default</Badge>
                {/if}
                <div class="pr-16">
                  {#if address.fullName}
                    <p class="font-medium">{address.fullName}</p>
                  {/if}
                  {#if address.company}
                    <p class="text-sm text-foreground-tertiary">{address.company}</p>
                  {/if}
                  <p class="text-sm text-foreground-tertiary">{address.streetLine1}</p>
                  {#if address.streetLine2}
                    <p class="text-sm text-foreground-tertiary">{address.streetLine2}</p>
                  {/if}
                  <p class="text-sm text-foreground-tertiary">
                    {address.postalCode}
                    {address.city}
                  </p>
                  <p class="text-sm text-foreground-tertiary">{address.country}</p>
                  {#if address.phoneNumber}
                    <p class="mt-1 text-sm text-muted-foreground">{address.phoneNumber}</p>
                  {/if}
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </AdminCard>

      <!-- Recent Orders Section -->
      <AdminCard title="Recent Orders" noPadding>
        {#if data.orders.length === 0}
          <div class="p-6">
            <p class="text-sm text-muted-foreground">No orders yet</p>
          </div>
        {:else}
          <Table class="rounded-none border-0 shadow-none">
            <TableHeader>
              <TableRow class="hover:bg-transparent">
                <TableHead class="px-4 py-3 text-sm">Order</TableHead>
                <TableHead class="px-4 py-3 text-sm">Date</TableHead>
                <TableHead class="px-4 py-3 text-sm">Status</TableHead>
                <TableHead class="px-4 py-3 text-right text-sm">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {#each data.orders as order}
                <TableRow>
                  <TableCell class="px-4 py-3 text-sm">
                    <a
                      href="/admin/orders/{order.id}"
                      class="font-medium text-blue-600 hover:text-blue-800 dark:text-blue-400"
                    >
                      #{order.code}
                    </a>
                  </TableCell>
                  <TableCell class="px-4 py-3 text-sm text-muted-foreground">
                    {formatDate(order.createdAt)}
                  </TableCell>
                  <TableCell class="px-4 py-3 text-sm">
                    <Badge variant={getStateVariant(order.state)}>
                      {order.state}
                    </Badge>
                  </TableCell>
                  <TableCell class="px-4 py-3 text-right text-sm font-medium">
                    {formatPrice(order.total)}
                    {BASE_CURRENCY}
                  </TableCell>
                </TableRow>
              {/each}
            </TableBody>
          </Table>
        {/if}
      </AdminCard>
    </div>

    <!-- Sidebar (Right) -->
    <div class="w-full space-y-6 lg:w-80 lg:shrink-0">
      <!-- Customer Information -->
      <AdminCard title="Customer Information" variant="sidebar">
        <div class="space-y-3 text-sm">
          <div>
            <span class="text-foreground-secondary">Email</span>
            <p class="font-medium">{data.customer.email}</p>
          </div>
          {#if data.customer.phone}
            <div>
              <span class="text-foreground-secondary">Phone</span>
              <p class="font-medium">{data.customer.phone}</p>
            </div>
          {/if}
          <div>
            <span class="text-foreground-secondary">Customer since</span>
            <p class="font-medium">{formatDate(data.customer.createdAt)}</p>
          </div>
        </div>
      </AdminCard>

      <!-- VAT ID -->
      <form
        method="POST"
        action="?/updateVatId"
        use:enhance={() => {
          return async ({ update }) => {
            await update({ reset: false });
          };
        }}
      >
        <AdminCard title="VAT ID" variant="sidebar">
          <div class="flex items-end gap-3">
            <div class="flex-1">
              <Label for="vatId">VAT ID</Label>
              <Input
                type="text"
                id="vatId"
                name="vatId"
                bind:value={vatId}
                placeholder="e.g. FI12345678"
              />
            </div>
            <Button type="submit" size="sm">Save</Button>
          </div>
        </AdminCard>
      </form>
    </div>
  </div>
</div>
