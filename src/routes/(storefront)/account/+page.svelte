<script lang="ts">
  import { STORE_NAME } from "$lib/config/store.js";
  import { enhance } from "$app/forms";
  import { Button } from "$lib/components/storefront/ui/button";
  import type { PageData, ActionData } from "./$types";

  let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<svelte:head>
  <title>My Account | {STORE_NAME}</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<div>
  <h2 class="mb-4 text-lg font-semibold">Profile Settings</h2>

  {#if form?.error}
    <div class="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-600">
      {form.error}
    </div>
  {/if}

  {#if form?.success}
    <div class="mb-4 rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-600">
      Profile updated successfully
    </div>
  {/if}

  {#if data.customer}
    <form
      method="POST"
      action="?/updateProfile"
      use:enhance={() => {
        return async ({ update }) => {
          await update({ reset: false });
        };
      }}
      class="space-y-4"
    >
      <div>
        <label for="email" class="mb-1 block text-sm font-medium text-gray-700"> Email </label>
        <input
          type="email"
          id="email"
          value={data.customer.email}
          disabled
          class="w-full cursor-not-allowed rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-gray-500"
        />
        <p class="mt-1 text-xs text-gray-500">Email cannot be changed</p>
      </div>

      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label for="firstName" class="mb-1 block text-sm font-medium text-gray-700">
            First Name
          </label>
          <input
            type="text"
            id="firstName"
            name="firstName"
            value={data.customer.firstName}
            required
            class="w-full rounded-lg border border-gray-300 px-3 py-2"
          />
        </div>
        <div>
          <label for="lastName" class="mb-1 block text-sm font-medium text-gray-700">
            Last Name
          </label>
          <input
            type="text"
            id="lastName"
            name="lastName"
            value={data.customer.lastName}
            required
            class="w-full rounded-lg border border-gray-300 px-3 py-2"
          />
        </div>
      </div>

      <div>
        <label for="phone" class="mb-1 block text-sm font-medium text-gray-700">
          Phone (optional)
        </label>
        <input
          type="tel"
          id="phone"
          name="phone"
          value={data.customer.phone ?? ""}
          class="w-full rounded-lg border border-gray-300 px-3 py-2"
        />
      </div>

      <div>
        <label for="vatId" class="mb-1 block text-sm font-medium text-gray-700">
          VAT ID (optional)
        </label>
        <input
          type="text"
          id="vatId"
          name="vatId"
          value={data.customer.vatId ?? ""}
          placeholder="e.g. FI12345678"
          class="w-full rounded-lg border border-gray-300 px-3 py-2"
        />
      </div>

      <div class="pt-2">
        <Button type="submit">Save Changes</Button>
      </div>
    </form>
  {:else}
    <p class="text-gray-500">Unable to load profile data.</p>
  {/if}
</div>
