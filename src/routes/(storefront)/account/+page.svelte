<script lang="ts">
  import { STORE_NAME } from "#lib/config/store.js";
  import { enhance } from "$app/forms";
  import { Button } from "#lib/components/storefront/ui/button/index.js";
  import hoikkaConfig from "#hoikka/config";
  import { fieldEntries } from "#lib/fields/index.js";
  import { formatDate } from "#lib/utils.js";
  import { imageUrl } from "#lib/image.js";
  import type { PageData, ActionData } from "./$types";

  let { data, form }: { data: PageData; form: ActionData } = $props();

  const fields = hoikkaConfig.customers.fields;
  const editableFields = fields.filter((def) => def.storefront === "edit");
  const details = $derived(
    data.customer
      ? fieldEntries(
          fields.filter((def) => def.storefront === "read"),
          data.customer
        )
      : []
  );
  const stored = (key: string) => data.customer?.customFields[key];
  const inputClass = "w-full rounded-lg border border-gray-300 px-3 py-2";
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

      {#each editableFields as def (def.key)}
        {@const id = `cf_${def.key}`}
        <div>
          {#if def.type === "boolean"}
            <label class="flex items-center gap-2 text-sm font-medium text-gray-700">
              <input type="checkbox" {id} name={id} checked={stored(def.key) === true} />
              {def.label}
            </label>
          {:else}
            <label for={id} class="mb-1 block text-sm font-medium text-gray-700">
              {def.label}{def.required ? "" : " (optional)"}
            </label>
            {#if def.type === "textarea"}
              <textarea
                {id}
                name={id}
                rows="3"
                required={def.required}
                class={inputClass}
                value={String(stored(def.key) ?? "")}></textarea>
            {:else if def.type === "select"}
              <select {id} name={id} required={def.required} class={inputClass}>
                <option value="">—</option>
                {#each def.options ?? [] as option (option)}
                  <option value={option} selected={stored(def.key) === option}>{option}</option>
                {/each}
              </select>
            {:else}
              <input
                type={def.type === "number" ? "number" : def.type === "date" ? "date" : "text"}
                step={def.type === "number" ? "any" : undefined}
                {id}
                name={id}
                required={def.required}
                class={inputClass}
                value={String(stored(def.key) ?? "")}
              />
            {/if}
          {/if}
          {#if def.help}
            <p class="mt-1 text-xs text-gray-500">{def.help}</p>
          {/if}
        </div>
      {/each}

      <div class="pt-2">
        <Button type="submit">Save Changes</Button>
      </div>
    </form>

    {#if details.length > 0}
      <h2 class="mt-8 mb-4 text-lg font-semibold">Account details</h2>
      <dl class="grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
        {#each details as { def, value } (def.key)}
          <dt class="font-medium text-gray-700">{def.label}</dt>
          <dd class="mb-2 text-gray-600 sm:mb-0">
            {#if def.type === "richtext"}
              <!-- eslint-disable-next-line svelte/no-at-html-tags -- sanitized on save in admin -->
              {@html value}
            {:else if def.type === "date"}
              <!-- Local midnight: a bare YYYY-MM-DD parses as UTC and can show the previous day -->
              {formatDate(`${value}T00:00`)}
            {:else if def.type === "boolean"}
              {value ? "Yes" : "No"}
            {:else if def.type === "image"}
              <img src={imageUrl(String(value), 128)} alt={def.label} class="h-16 w-auto rounded" />
            {:else}
              <span class="whitespace-pre-line">{value}</span>
            {/if}
          </dd>
        {/each}
      </dl>
    {/if}
  {:else}
    <p class="text-gray-500">Unable to load profile data.</p>
  {/if}
</div>
