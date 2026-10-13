<script lang="ts">
  import hoikkaConfig from "$hoikka/config";
  import { STORE_NAME } from "$lib/config/store.js";
  import { fieldEntries } from "$lib/fields/index.js";
  import { formatDate, stripHtml } from "$lib/utils";
  import { imageUrl } from "$lib/image";

  let { data } = $props();

  const templateFields = $derived(
    fieldEntries(hoikkaConfig.contentPages.templates[data.page.template]?.fields ?? [], data.page)
  );
  const imageFields = $derived(templateFields.filter(({ def }) => def.type === "image"));
  const detailFields = $derived(templateFields.filter(({ def }) => def.type !== "image"));
  const ogImage = $derived(data.page.imageUrl ?? (imageFields[0]?.value as string | undefined));
</script>

<svelte:head>
  <title>{data.page.title} | {STORE_NAME}</title>
  <meta
    name="description"
    content={stripHtml(data.page.body)?.slice(0, 160) || data.page.title || ""}
  />
  <meta property="og:title" content="{data.page.title} | {STORE_NAME}" />
  <meta
    property="og:description"
    content={stripHtml(data.page.body)?.slice(0, 160) || data.page.title || ""}
  />
  <meta property="og:type" content="article" />
  {#if ogImage}
    <meta property="og:image" content={imageUrl(ogImage, 1200)} />
  {/if}
</svelte:head>

<div class="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8" data-template={data.page.template}>
  {#if data.page.imageUrl}
    <img
      src={imageUrl(data.page.imageUrl, 768)}
      alt={data.page.title}
      class="mb-8 h-auto w-full rounded-lg object-cover"
    />
  {/if}
  {#each imageFields as { def, value } (def.key)}
    <img
      src={imageUrl(String(value), 768)}
      alt={def.label}
      class="mb-8 h-auto w-full rounded-lg object-cover"
    />
  {/each}
  <h1 class="text-3xl font-bold text-gray-900">{data.page.title}</h1>
  {#if detailFields.length > 0}
    <dl class="mt-4 grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-sm">
      {#each detailFields as { def, value } (def.key)}
        <dt class="font-medium text-gray-700">{def.label}</dt>
        <dd class="text-gray-600">
          {#if def.type === "richtext"}
            <!-- eslint-disable-next-line svelte/no-at-html-tags -- sanitized on save in admin -->
            {@html value}
          {:else if def.type === "date"}
            <!-- Local midnight: a bare YYYY-MM-DD parses as UTC and can show the previous day -->
            {formatDate(`${value}T00:00`)}
          {:else if def.type === "boolean"}
            {value ? "Yes" : "No"}
          {:else}
            <span class="whitespace-pre-line">{value}</span>
          {/if}
        </dd>
      {/each}
    </dl>
  {/if}
  {#if data.page.body}
    <div class="prose prose-lg mt-6 max-w-none prose-gray">
      <!-- eslint-disable-next-line svelte/no-at-html-tags -- sanitized on save in admin -->
      {@html data.page.body}
    </div>
  {/if}
</div>
