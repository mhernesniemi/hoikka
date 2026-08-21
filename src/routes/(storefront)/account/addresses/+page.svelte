<script lang="ts">
  import { SHIPPING_COUNTRIES } from "$lib/config/countries.js";
  import { STORE_NAME } from "$lib/config/store.js";
  import { enhance } from "$app/forms";
  import { Button } from "$lib/components/storefront/ui/button";
  import type { PageData, ActionData } from "./$types";
  import MapPin from "@lucide/svelte/icons/map-pin";

  let { data, form }: { data: PageData; form: ActionData } = $props();

  let showAddForm = $state(false);
  let editingAddressId = $state<number | null>(null);

  function getEditingAddress() {
    return data.addresses.find((a) => a.id === editingAddressId);
  }
</script>

<svelte:head>
  <title>My Addresses | {STORE_NAME}</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<div class="space-y-6">
  <div class="flex items-center justify-between">
    <div>
      <h2 class="text-lg font-semibold">Saved Addresses</h2>
      <p class="text-sm text-gray-600">Manage your shipping addresses</p>
    </div>
    {#if !showAddForm && !editingAddressId}
      <Button type="button" onclick={() => (showAddForm = true)}>Add Address</Button>
    {/if}
  </div>

  {#if form?.error}
    <div class="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-600">
      {form.error}
    </div>
  {/if}

  {#if form?.success}
    <div class="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-600">
      Address saved successfully
    </div>
  {/if}

  <!-- Add Address Form -->
  {#if showAddForm}
    <div class="rounded-lg border border-gray-200 bg-white p-6">
      <h3 class="mb-4 font-medium">Add New Address</h3>
      <form
        method="POST"
        action="?/add"
        use:enhance={() => {
          return async ({ result, update }) => {
            await update();
            if (result.type === "success") {
              showAddForm = false;
            }
          };
        }}
        class="space-y-4"
      >
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label for="fullName" class="mb-1 block text-sm font-medium text-gray-700">
              Full Name
            </label>
            <input
              type="text"
              id="fullName"
              name="fullName"
              class="w-full rounded-lg border border-gray-300 px-3 py-2"
            />
          </div>
          <div>
            <label for="company" class="mb-1 block text-sm font-medium text-gray-700">
              Company (optional)
            </label>
            <input
              type="text"
              id="company"
              name="company"
              class="w-full rounded-lg border border-gray-300 px-3 py-2"
            />
          </div>
        </div>

        <div>
          <label for="streetLine1" class="mb-1 block text-sm font-medium text-gray-700">
            Street Address <span class="text-red-500">*</span>
          </label>
          <input
            type="text"
            id="streetLine1"
            name="streetLine1"
            required
            class="w-full rounded-lg border border-gray-300 px-3 py-2"
          />
        </div>

        <div>
          <label for="streetLine2" class="mb-1 block text-sm font-medium text-gray-700">
            Apartment, suite, etc. (optional)
          </label>
          <input
            type="text"
            id="streetLine2"
            name="streetLine2"
            class="w-full rounded-lg border border-gray-300 px-3 py-2"
          />
        </div>

        <div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label for="city" class="mb-1 block text-sm font-medium text-gray-700">
              City <span class="text-red-500">*</span>
            </label>
            <input
              type="text"
              id="city"
              name="city"
              required
              class="w-full rounded-lg border border-gray-300 px-3 py-2"
            />
          </div>
          <div>
            <label for="postalCode" class="mb-1 block text-sm font-medium text-gray-700">
              Postal Code <span class="text-red-500">*</span>
            </label>
            <input
              type="text"
              id="postalCode"
              name="postalCode"
              required
              class="w-full rounded-lg border border-gray-300 px-3 py-2"
            />
          </div>
          <div>
            <label for="country" class="mb-1 block text-sm font-medium text-gray-700">
              Country <span class="text-red-500">*</span>
            </label>
            <select
              id="country"
              name="country"
              required
              class="w-full rounded-lg border border-gray-300 px-3 py-2"
            >
              <option value="">Select country</option>
              {#each SHIPPING_COUNTRIES as shippingCountry}
                <option value={shippingCountry.code}>{shippingCountry.name}</option>
              {/each}
              <option value="SE">Sweden</option>
              <option value="NO">Norway</option>
              <option value="DK">Denmark</option>
              <option value="EE">Estonia</option>
              <option value="DE">Germany</option>
            </select>
          </div>
        </div>

        <div>
          <label for="phoneNumber" class="mb-1 block text-sm font-medium text-gray-700">
            Phone Number (optional)
          </label>
          <input
            type="tel"
            id="phoneNumber"
            name="phoneNumber"
            class="w-full rounded-lg border border-gray-300 px-3 py-2"
          />
        </div>

        <div class="flex items-center gap-2">
          <input
            type="checkbox"
            id="isDefault"
            name="isDefault"
            class="h-4 w-4 rounded border-gray-300 text-blue-600"
          />
          <label for="isDefault" class="text-sm text-gray-700"> Set as default address </label>
        </div>

        <div class="flex justify-end gap-3">
          <Button type="button" variant="outline" onclick={() => (showAddForm = false)}>
            Cancel
          </Button>
          <Button type="submit">Save Address</Button>
        </div>
      </form>
    </div>
  {/if}

  <!-- Edit Address Form -->
  {#if editingAddressId}
    {@const address = getEditingAddress()}
    {#if address}
      <div class="rounded-lg border border-gray-200 bg-white p-6">
        <h3 class="mb-4 font-medium">Edit Address</h3>
        <form
          method="POST"
          action="?/update"
          use:enhance={() => {
            return async ({ result, update }) => {
              await update();
              if (result.type === "success") {
                editingAddressId = null;
              }
            };
          }}
          class="space-y-4"
        >
          <input type="hidden" name="addressId" value={address.id} />

          <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label for="edit_fullName" class="mb-1 block text-sm font-medium text-gray-700">
                Full Name
              </label>
              <input
                type="text"
                id="edit_fullName"
                name="fullName"
                value={address.fullName ?? ""}
                class="w-full rounded-lg border border-gray-300 px-3 py-2"
              />
            </div>
            <div>
              <label for="edit_company" class="mb-1 block text-sm font-medium text-gray-700">
                Company (optional)
              </label>
              <input
                type="text"
                id="edit_company"
                name="company"
                value={address.company ?? ""}
                class="w-full rounded-lg border border-gray-300 px-3 py-2"
              />
            </div>
          </div>

          <div>
            <label for="edit_streetLine1" class="mb-1 block text-sm font-medium text-gray-700">
              Street Address <span class="text-red-500">*</span>
            </label>
            <input
              type="text"
              id="edit_streetLine1"
              name="streetLine1"
              value={address.streetLine1}
              required
              class="w-full rounded-lg border border-gray-300 px-3 py-2"
            />
          </div>

          <div>
            <label for="edit_streetLine2" class="mb-1 block text-sm font-medium text-gray-700">
              Apartment, suite, etc. (optional)
            </label>
            <input
              type="text"
              id="edit_streetLine2"
              name="streetLine2"
              value={address.streetLine2 ?? ""}
              class="w-full rounded-lg border border-gray-300 px-3 py-2"
            />
          </div>

          <div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label for="edit_city" class="mb-1 block text-sm font-medium text-gray-700">
                City <span class="text-red-500">*</span>
              </label>
              <input
                type="text"
                id="edit_city"
                name="city"
                value={address.city}
                required
                class="w-full rounded-lg border border-gray-300 px-3 py-2"
              />
            </div>
            <div>
              <label for="edit_postalCode" class="mb-1 block text-sm font-medium text-gray-700">
                Postal Code <span class="text-red-500">*</span>
              </label>
              <input
                type="text"
                id="edit_postalCode"
                name="postalCode"
                value={address.postalCode}
                required
                class="w-full rounded-lg border border-gray-300 px-3 py-2"
              />
            </div>
            <div>
              <label for="edit_country" class="mb-1 block text-sm font-medium text-gray-700">
                Country <span class="text-red-500">*</span>
              </label>
              <select
                id="edit_country"
                name="country"
                required
                class="w-full rounded-lg border border-gray-300 px-3 py-2"
              >
                <option value="">Select country</option>
                {#each SHIPPING_COUNTRIES as shippingCountry}
                  <option
                    value={shippingCountry.code}
                    selected={address.country === shippingCountry.code}
                    >{shippingCountry.name}</option
                  >
                {/each}
                <option value="SE" selected={address.country === "SE"}>Sweden</option>
                <option value="NO" selected={address.country === "NO"}>Norway</option>
                <option value="DK" selected={address.country === "DK"}>Denmark</option>
                <option value="EE" selected={address.country === "EE"}>Estonia</option>
                <option value="DE" selected={address.country === "DE"}>Germany</option>
              </select>
            </div>
          </div>

          <div>
            <label for="edit_phoneNumber" class="mb-1 block text-sm font-medium text-gray-700">
              Phone Number (optional)
            </label>
            <input
              type="tel"
              id="edit_phoneNumber"
              name="phoneNumber"
              value={address.phoneNumber ?? ""}
              class="w-full rounded-lg border border-gray-300 px-3 py-2"
            />
          </div>

          <div class="flex items-center gap-2">
            <input
              type="checkbox"
              id="edit_isDefault"
              name="isDefault"
              checked={address.isDefault}
              class="h-4 w-4 rounded border-gray-300 text-blue-600"
            />
            <label for="edit_isDefault" class="text-sm text-gray-700">
              Set as default address
            </label>
          </div>

          <div class="flex justify-end gap-3">
            <Button type="button" variant="outline" onclick={() => (editingAddressId = null)}>
              Cancel
            </Button>
            <Button type="submit">Update Address</Button>
          </div>
        </form>
      </div>
    {/if}
  {/if}

  <!-- Address List -->
  {#if !showAddForm && !editingAddressId}
    {#if data.addresses.length === 0}
      <div class="rounded-lg border border-dashed border-gray-300 p-8 text-center">
        <MapPin class="mx-auto h-12 w-12 text-gray-400" />
        <h3 class="mt-2 text-sm font-medium text-gray-900">No saved addresses</h3>
        <p class="mt-1 text-sm text-gray-500">Add an address to speed up checkout.</p>
        <div class="mt-4">
          <Button type="button" onclick={() => (showAddForm = true)}>Add Address</Button>
        </div>
      </div>
    {:else}
      <div class="flex flex-col gap-4">
        {#each data.addresses as address}
          <div class="relative rounded-lg border border-gray-200 bg-white p-4">
            {#if address.isDefault}
              <span
                class="absolute top-2 right-2 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800"
              >
                Default
              </span>
            {/if}
            <div class="pr-16">
              {#if address.fullName}
                <p class="font-medium">{address.fullName}</p>
              {/if}
              {#if address.company}
                <p class="text-sm text-gray-600">{address.company}</p>
              {/if}
              <p class="text-sm text-gray-600">{address.streetLine1}</p>
              {#if address.streetLine2}
                <p class="text-sm text-gray-600">{address.streetLine2}</p>
              {/if}
              <p class="text-sm text-gray-600">
                {address.postalCode}
                {address.city}
              </p>
              <p class="text-sm text-gray-600">{address.country}</p>
              {#if address.phoneNumber}
                <p class="mt-1 text-sm text-gray-500">{address.phoneNumber}</p>
              {/if}
            </div>

            <div class="mt-4 flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onclick={() => (editingAddressId = address.id)}
              >
                Edit
              </Button>
              {#if !address.isDefault}
                <form method="POST" action="?/setDefault" use:enhance class="inline">
                  <input type="hidden" name="addressId" value={address.id} />
                  <Button type="submit" variant="outline" size="sm">Set as default</Button>
                </form>
              {/if}
              <form method="POST" action="?/delete" use:enhance class="inline">
                <input type="hidden" name="addressId" value={address.id} />
                <Button
                  type="submit"
                  variant="destructive-outline"
                  size="sm"
                  onclick={(e) => {
                    if (!confirm("Are you sure you want to delete this address?")) {
                      e.preventDefault();
                    }
                  }}
                >
                  Delete
                </Button>
              </form>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  {/if}
</div>
