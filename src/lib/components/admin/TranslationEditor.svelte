<script lang="ts">
  /**
   * One card for a localized entity: a language tab per configured language.
   * The default language's tab shows the page's own inputs (passed as
   * `children`); the other tabs show the translation inputs for `fields`.
   * Every tab stays mounted (hidden) so all languages submit with the form.
   */
  import type { Snippet } from "svelte";
  import { RichTextEditor } from "$lib/components/admin/ui/rich-text-editor";
  import { Input } from "$lib/components/admin/ui/input";
  import { Label } from "$lib/components/admin/ui/label";
  import { Textarea } from "$lib/components/admin/ui/textarea";
  import { cn } from "$lib/utils";
  import { TRANSLATION_LANGUAGES, DEFAULT_LANGUAGE, LANGUAGES } from "$lib/config/languages.js";
  import Globe from "@lucide/svelte/icons/globe";

  interface Field {
    name: string;
    label: string;
    type: "text" | "textarea" | "richtext";
  }

  interface Props {
    fields: Field[];
    translations: Record<string, Record<string, string | null>>;
    formId: string;
    /** Card title; "Translations" when the card holds translations only */
    title?: string;
    /** The default-language inputs, shown under the first tab */
    children?: Snippet;
  }

  let { fields, translations, formId, title, children }: Props = $props();

  const defaultLanguage = LANGUAGES.find((l) => l.code === DEFAULT_LANGUAGE);
  // Without the default-language inputs the card is translations only
  const tabs = children
    ? [...(defaultLanguage ? [defaultLanguage] : []), ...TRANSLATION_LANGUAGES]
    : TRANSLATION_LANGUAGES;

  let activeTab = $state(tabs[0]?.code ?? DEFAULT_LANGUAGE);
</script>

{#if tabs.length > 0}
  <div class="overflow-hidden rounded-lg bg-surface shadow">
    <div class="flex items-center gap-2 border-b border-border px-6 py-4">
      {#if !children}
        <Globe class="h-4 w-4 text-muted-foreground" />
      {/if}
      <h2 class="text-lg font-semibold">
        {title ??
          `Translations${TRANSLATION_LANGUAGES.length === 1 ? ` (${TRANSLATION_LANGUAGES[0].name})` : ""}`}
      </h2>
    </div>

    {#if tabs.length > 1}
      <div class="flex border-b border-border px-2" role="tablist">
        {#each tabs as lang (lang.code)}
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === lang.code}
            class={cn(
              "px-4 py-2 text-sm font-medium",
              activeTab === lang.code
                ? "border-b-2 border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400"
                : "text-muted-foreground hover:text-foreground"
            )}
            onclick={() => (activeTab = lang.code)}
          >
            {lang.name}
          </button>
        {/each}
      </div>
    {/if}

    <div class="p-6">
      {#if children}
        <div class={cn(activeTab !== DEFAULT_LANGUAGE && "hidden")}>
          {@render children()}
        </div>
      {/if}

      {#each TRANSLATION_LANGUAGES as lang (lang.code)}
        {@const textFieldCount = fields.filter((f) => f.type === "text").length}
        <div class={cn(activeTab !== lang.code && "hidden")}>
          <div class={cn("grid grid-cols-1 gap-4", textFieldCount > 1 && "sm:grid-cols-2")}>
            {#each fields as field (field.name)}
              <div class={cn(field.type !== "text" && textFieldCount > 1 && "sm:col-span-2")}>
                <Label for="translation_{lang.code}_{field.name}">{field.label}</Label>

                {#if field.type === "text"}
                  <Input
                    type="text"
                    id="translation_{lang.code}_{field.name}"
                    name="{field.name}_{lang.code}"
                    form={formId}
                    value={translations[lang.code]?.[field.name] ?? ""}
                  />
                {:else if field.type === "textarea"}
                  <Textarea
                    id="translation_{lang.code}_{field.name}"
                    name="{field.name}_{lang.code}"
                    form={formId}
                    rows={4}>{translations[lang.code]?.[field.name] ?? ""}</Textarea
                  >
                {:else if field.type === "richtext"}
                  <RichTextEditor
                    name="{field.name}_{lang.code}"
                    form={formId}
                    content={translations[lang.code]?.[field.name] ?? ""}
                    placeholder="Write {field.label.toLowerCase()}..."
                  />
                {/if}
              </div>
            {/each}
          </div>

          <p class="mt-3 text-xs text-muted-foreground">
            Leave empty to use the default ({defaultLanguage?.name}) value.
          </p>
        </div>
      {/each}
    </div>
  </div>
{/if}
