<script lang="ts">
  import { enhance } from "$app/forms";
  import { cn } from "$lib/utils";
  import { Button, buttonVariants } from "$lib/components/admin/ui/button";
  import { Input } from "$lib/components/admin/ui/input";
  import { Label } from "$lib/components/admin/ui/label";
  import { Badge } from "$lib/components/admin/ui/badge";
  import AdminCard from "$lib/components/admin/AdminCard.svelte";
  import PromotionForm, { typeLabels } from "$lib/components/admin/PromotionForm.svelte";
  import type { PageData, ActionData } from "./$types";
  import ShoppingCart from "@lucide/svelte/icons/shopping-cart";
  import Tag from "@lucide/svelte/icons/tag";
  import Truck from "@lucide/svelte/icons/truck";
  import ChevronLeft from "@lucide/svelte/icons/chevron-left";
  import { toast } from "svelte-sonner";
  import UnsavedChangesDialog from "$lib/components/admin/UnsavedChangesDialog.svelte";

  let { data, form }: { data: PageData; form: ActionData } = $props();

  $effect(() => {
    if (form?.error) toast.error(form.error);
  });

  let isSubmitting = $state(false);
  let code = $state("");
  let title = $state("");
  let discountValue = $state<number | string>("");
  let minOrderAmount = $state<number | string>("");
  let usageLimit = $state<number | string>("");
  let usageLimitPerCustomer = $state<number | string>("");
  let startsAt = $state("");
  let endsAt = $state("");

  let method = $state<"code" | "automatic">("automatic");
  let promotionType = $state<"order" | "product" | "free_shipping">("order");
  let discountType = $state<"percentage" | "fixed_amount">("percentage");
  let appliesTo = $state<"all" | "specific_products" | "specific_collections">("all");
  let selectedProductIds = $state<number[]>([]);
  let selectedCollectionIds = $state<number[]>([]);
  let combinesWithOtherPromotions = $state(false);

  const hasUnsavedChanges = $derived(
    code !== "" ||
      title !== "" ||
      discountValue !== "" ||
      selectedProductIds.length > 0 ||
      selectedCollectionIds.length > 0 ||
      minOrderAmount !== "" ||
      usageLimit !== "" ||
      usageLimitPerCustomer !== "" ||
      startsAt !== "" ||
      endsAt !== "" ||
      combinesWithOtherPromotions
  );

  const typeOptions = [
    { value: "order" as const, label: "Amount off order", icon: ShoppingCart },
    { value: "product" as const, label: "Amount off products", icon: Tag },
    { value: "free_shipping" as const, label: "Free shipping", icon: Truck }
  ];
</script>

<svelte:head><title>Create Promotion | Admin</title></svelte:head>

<div class="space-y-6">
  <div class="mb-6 flex items-center justify-between">
    <a
      href="/admin/promotions"
      class="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline dark:text-blue-400"
      ><ChevronLeft class="h-4 w-4" /> Back to Promotions</a
    >
  </div>
  <div class="flex items-center justify-between">
    <h1 class="text-2xl font-bold">Create Promotion</h1>
    <div class="flex items-center gap-3">
      <a href="/admin/promotions" class={buttonVariants({ variant: "outline" })}>Cancel</a>
      <Button type="submit" form="create-form" disabled={isSubmitting}>
        {isSubmitting ? "Creating..." : "Create Promotion"}
      </Button>
    </div>
  </div>

  <form
    method="POST"
    use:enhance={() => {
      isSubmitting = true;
      return async ({ update }) => {
        await update({ reset: false });
        isSubmitting = false;
      };
    }}
    id="create-form"
  >
    <PromotionForm
      products={data.products}
      collections={data.collections}
      customerGroups={data.customerGroups}
      {promotionType}
      discountValuePlaceholder={discountType === "percentage" ? "e.g., 20" : "e.g., 10.00"}
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
    >
      {#snippet main()}
        <!-- Type Selection -->
        <AdminCard title="Promotion Type">
          <div class="grid grid-cols-3 gap-3">
            {#each typeOptions as option}
              <label
                class={cn(
                  "flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 p-4 text-center transition-colors",
                  promotionType === option.value
                    ? "border-blue-500 bg-accent-subtle"
                    : "border-border hover:border-input-border"
                )}
              >
                <input
                  type="radio"
                  name="promotionType"
                  value={option.value}
                  bind:group={promotionType}
                  class="sr-only"
                />
                <option.icon
                  class={cn(
                    "h-6 w-6",
                    promotionType === option.value
                      ? "text-blue-600 dark:text-blue-400"
                      : "text-placeholder"
                  )}
                />
                <span class="text-sm font-medium">{option.label}</span>
              </label>
            {/each}
          </div>
        </AdminCard>

        <!-- Method + Code/Title -->
        <AdminCard title="Discount Method">
          <input type="hidden" name="method" value={method} />
          <div class="mb-4 inline-flex rounded-lg border border-input-border p-0.5">
            <button
              type="button"
              class={cn(
                "rounded-md px-4 py-1.5 text-sm font-medium transition-colors",
                method === "automatic"
                  ? "border border-input-border  text-foreground"
                  : "border border-transparent text-foreground-tertiary hover:text-foreground"
              )}
              onclick={() => (method = "automatic")}
            >
              Automatic discount
            </button>
            <button
              type="button"
              class={cn(
                "rounded-md px-4 py-1.5 text-sm font-medium transition-colors",
                method === "code"
                  ? "border border-input-border  text-foreground"
                  : "border border-transparent text-muted-foreground hover:text-foreground"
              )}
              onclick={() => (method = "code")}
            >
              Discount code
            </button>
          </div>

          {#if method === "code"}
            <div>
              <Label for="code">Code <span class="text-red-500">*</span></Label>
              <Input
                type="text"
                id="code"
                name="code"
                bind:value={code}
                placeholder="e.g., SUMMER20"
                required
                class="uppercase"
              />
              <p class="mt-1 text-xs text-muted-foreground">
                Customers will enter this code at checkout.
              </p>
            </div>
          {:else}
            <div>
              <Label for="title">Title <span class="text-red-500">*</span></Label>
              <Input
                type="text"
                id="title"
                name="title"
                bind:value={title}
                placeholder="e.g., Summer Sale 20% Off"
                required
              />
            </div>
          {/if}
        </AdminCard>
      {/snippet}

      {#snippet sidebarBottom()}
        <!-- Summary -->
        <AdminCard title="Summary" variant="sidebar">
          <div class="space-y-2 text-sm text-foreground-tertiary">
            <p>
              <span class="font-medium text-foreground">Method:</span>
              <Badge variant="outline">{method === "code" ? "Discount code" : "Automatic"}</Badge>
            </p>
            <p>
              <span class="font-medium text-foreground">Type:</span>
              <Badge variant="outline">{typeLabels[promotionType]}</Badge>
            </p>
            {#if promotionType !== "free_shipping"}
              <p>
                <span class="font-medium text-foreground">Discount:</span>
                {discountType === "percentage" ? "Percentage off" : "Fixed amount off"}
              </p>
            {/if}
            {#if promotionType === "product"}
              <p>
                <span class="font-medium text-foreground">Applies to:</span>
                {appliesTo === "all"
                  ? "All products"
                  : appliesTo === "specific_products"
                    ? `${selectedProductIds.length} product(s)`
                    : `${selectedCollectionIds.length} collection(s)`}
              </p>
            {/if}
          </div>
        </AdminCard>
      {/snippet}
    </PromotionForm>
  </form>
</div>

<UnsavedChangesDialog isDirty={() => hasUnsavedChanges} isSaving={() => isSubmitting} />
