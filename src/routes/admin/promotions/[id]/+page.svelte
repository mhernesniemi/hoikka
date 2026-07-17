<script lang="ts">
  import { enhance } from "$app/forms";
  import { page } from "$app/state";
  import { onMount } from "svelte";
  import { Button } from "$lib/components/admin/ui/button";
  import { Checkbox } from "$lib/components/admin/ui/checkbox";
  import { Input } from "$lib/components/admin/ui/input";
  import { Label } from "$lib/components/admin/ui/label";
  import DeleteConfirmDialog from "$lib/components/admin/DeleteConfirmDialog.svelte";
  import AdminCard from "$lib/components/admin/AdminCard.svelte";
  import { Badge } from "$lib/components/admin/ui/badge";
  import PromotionForm, { typeLabels } from "$lib/components/admin/PromotionForm.svelte";
  import UnsavedChangesDialog from "$lib/components/admin/UnsavedChangesDialog.svelte";
  import type { PageData, ActionData } from "./$types";
  import { toast } from "svelte-sonner";
  import ChevronLeft from "@lucide/svelte/icons/chevron-left";

  let { data, form }: { data: PageData; form: ActionData } = $props();

  let promo = $derived(data.promotion);

  let discountType = $state(promo.discountType);
  let appliesTo = $state(promo.appliesTo);
  let selectedProductIds = $state<number[]>(promo.products.map((p) => p.productId));
  let selectedCollectionIds = $state<number[]>(promo.collections.map((c) => c.collectionId));
  let enabled = $state(promo.enabled);
  let combinesWithOtherPromotions = $state(promo.combinesWithOtherPromotions);
  let promoTitle = $state(promo.title ?? "");
  let discountValue = $state<number | string>(
    promo.discountType === "fixed_amount" ? promo.discountValue / 100 : promo.discountValue
  );
  let minOrderAmount = $state<number | string>(
    promo.minOrderAmount ? promo.minOrderAmount / 100 : ""
  );
  let usageLimit = $state<number | string>(promo.usageLimit ?? "");
  let usageLimitPerCustomer = $state<number | string>(promo.usageLimitPerCustomer ?? "");
  let startsAt = $state(formatDateForInput(promo.startsAt));
  let endsAt = $state(formatDateForInput(promo.endsAt));
  let customerGroupId = $state(String(promo.customerGroupId ?? ""));
  let showDelete = $state(false);

  function formatPrice(cents: number): string {
    return (cents / 100).toFixed(2);
  }

  function formatDateForInput(date: Date | null): string {
    if (!date) return "";
    const d = new Date(date);
    // Format as YYYY-MM-DDTHH:mm for datetime-local input
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const hours = String(d.getHours()).padStart(2, "0");
    const minutes = String(d.getMinutes()).padStart(2, "0");
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  }

  const promoStatus = $derived.by(() => {
    if (!promo.enabled) return { label: "Disabled", variant: "secondary" as const };
    const now = new Date();
    if (promo.startsAt && new Date(promo.startsAt) > now)
      return { label: "Scheduled", variant: "warning" as const };
    if (promo.endsAt && new Date(promo.endsAt) < now)
      return { label: "Expired", variant: "destructive" as const };
    return { label: "Active", variant: "success" as const };
  });

  onMount(() => {
    if (page.url.searchParams.has("created")) {
      toast.success("Promotion created successfully");
      history.replaceState({}, "", page.url.pathname);
    }
  });

  $effect(() => {
    if (form?.error) toast.error(form.error);
  });

  const hasUnsavedChanges = $derived.by(() => {
    const origDiscountValue =
      promo.discountType === "fixed_amount" ? promo.discountValue / 100 : promo.discountValue;
    return (
      promoTitle !== (promo.title ?? "") ||
      discountType !== promo.discountType ||
      discountValue !== origDiscountValue ||
      appliesTo !== promo.appliesTo ||
      [...selectedProductIds].sort().join() !==
        promo.products
          .map((p) => p.productId)
          .sort()
          .join() ||
      [...selectedCollectionIds].sort().join() !==
        promo.collections
          .map((c) => c.collectionId)
          .sort()
          .join() ||
      enabled !== promo.enabled ||
      combinesWithOtherPromotions !== promo.combinesWithOtherPromotions ||
      minOrderAmount !== (promo.minOrderAmount ? promo.minOrderAmount / 100 : "") ||
      String(usageLimit) !== String(promo.usageLimit ?? "") ||
      String(usageLimitPerCustomer) !== String(promo.usageLimitPerCustomer ?? "") ||
      startsAt !== formatDateForInput(promo.startsAt) ||
      endsAt !== formatDateForInput(promo.endsAt) ||
      customerGroupId !== String(promo.customerGroupId ?? "")
    );
  });
</script>

<svelte:head><title>Edit {promo.code} | Admin</title></svelte:head>

<div class="space-y-6">
  <div class="mb-6 flex items-center justify-between">
    <a
      href="/admin/promotions"
      class="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline dark:text-blue-400"
      ><ChevronLeft class="h-4 w-4" /> Back to Promotions</a
    >
  </div>
  <div class="flex items-center justify-between">
    <div class="flex items-center gap-4">
      <h1 class="text-2xl font-bold">
        {promo.method === "automatic" ? promo.title : promo.code}
      </h1>
      <Badge variant="outline">{promo.method === "code" ? "Discount code" : "Automatic"}</Badge>
      <Badge variant="outline">{typeLabels[promo.promotionType]}</Badge>
      <Badge variant={promoStatus.variant}>{promoStatus.label}</Badge>
    </div>
    <Button type="submit" form="edit-form">Save Changes</Button>
  </div>

  <form
    method="POST"
    action="?/update"
    use:enhance={() => {
      return async ({ result, update }) => {
        await update({ reset: false });
        if (result.type === "success") {
          toast.success("Promotion updated");
        }
      };
    }}
    id="edit-form"
  >
    <PromotionForm
      products={data.products}
      collections={data.collections}
      customerGroups={data.customerGroups}
      promotionType={promo.promotionType}
      bind:discountType
      bind:discountValue
      bind:appliesTo
      bind:selectedProductIds
      bind:selectedCollectionIds
      bind:minOrderAmount
      bind:usageLimit
      bind:usageLimitPerCustomer
      bind:startsAt
      bind:endsAt
      bind:combinesWithOtherPromotions
      bind:customerGroupId
    >
      {#snippet main()}
        <!-- Code / Title -->
        <AdminCard title={promo.method === "code" ? "Promotion Code" : "Automatic Discount"}>
          {#if promo.method === "code"}
            <div>
              <Label for="code">Code</Label>
              <Input
                type="text"
                id="code"
                value={promo.code}
                disabled
                class="border-border bg-background text-muted-foreground"
              />
            </div>
          {:else}
            <div>
              <Label for="title">Title <span class="text-red-500">*</span></Label>
              <Input type="text" id="title" name="title" bind:value={promoTitle} required />
              <p class="mt-1 text-xs text-muted-foreground">
                Customers will see this in their cart and at checkout.
              </p>
            </div>
          {/if}
        </AdminCard>
      {/snippet}

      {#snippet mainFooter()}
        <button
          type="button"
          class="text-sm text-red-600 hover:text-red-800 dark:text-red-700"
          onclick={() => (showDelete = true)}
        >
          Delete this promotion
        </button>
      {/snippet}

      {#snippet sidebarTop()}
        <!-- Status -->
        <AdminCard title="Status" variant="sidebar">
          <label class="flex items-center gap-2">
            <Checkbox bind:checked={enabled} />
            {#if enabled}
              <input type="hidden" name="enabled" value="on" />
            {/if}
            <span class="text-sm">Enabled</span>
          </label>
        </AdminCard>
      {/snippet}

      {#snippet sidebarBottom()}
        <!-- Usage Info -->
        <AdminCard title="Usage" variant="sidebar">
          <p class="text-sm text-foreground-tertiary">
            Used <span class="font-medium text-foreground">{promo.usageCount}</span>
            time{promo.usageCount !== 1 ? "s" : ""}
            {#if promo.usageLimit}
              out of {promo.usageLimit}
            {/if}
          </p>
        </AdminCard>
      {/snippet}
    </PromotionForm>
  </form>
</div>

<UnsavedChangesDialog isDirty={() => hasUnsavedChanges} />

<DeleteConfirmDialog
  bind:open={showDelete}
  title="Delete Promotion?"
  description="This will permanently delete the promotion code {promo.code}. This action cannot be undone."
/>
