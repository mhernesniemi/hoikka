<!--
  Renders admin form inputs for the custom fields declared in hoikka.config.ts.
  One component for every entity kind: give it the field definitions and the
  entity's stored values, and it emits inputs named cf_<key> into the
  surrounding form (via the `form` attribute when the inputs live outside the
  form element). The matching server action reads them with coerceFormFields().
-->
<script lang="ts">
  import type { FieldDef } from "$lib/fields/index.js";
  import { Input } from "$lib/components/admin/ui/input";
  import { Label } from "$lib/components/admin/ui/label";
  import { Textarea } from "$lib/components/admin/ui/textarea";
  import { Checkbox } from "$lib/components/admin/ui/checkbox";
  import { SelectNative } from "$lib/components/admin/ui/select-native";
  import { RichTextEditor } from "$lib/components/admin/ui/rich-text-editor";

  let {
    defs,
    values = {},
    formId
  }: {
    defs: readonly FieldDef[];
    values?: Record<string, unknown>;
    formId?: string;
  } = $props();

  const asString = (key: string) => {
    const value = values[key];
    return typeof value === "string" || typeof value === "number" ? String(value) : "";
  };
</script>

{#each defs as def (def.key)}
  <div>
    {#if def.type === "boolean"}
      <div class="flex items-center gap-2">
        <Checkbox
          id="cf_{def.key}"
          name="cf_{def.key}"
          form={formId}
          checked={values[def.key] === true}
        />
        <Label for="cf_{def.key}">{def.label}</Label>
      </div>
    {:else}
      <Label for="cf_{def.key}">
        {def.label}
        {#if def.required}<span class="text-red-500">*</span>{/if}
      </Label>
      {#if def.type === "textarea"}
        <Textarea
          id="cf_{def.key}"
          name="cf_{def.key}"
          form={formId}
          value={asString(def.key)}
          rows={4}
        />
      {:else if def.type === "richtext"}
        <RichTextEditor
          name="cf_{def.key}"
          form={formId}
          content={asString(def.key)}
          placeholder={def.label}
        />
      {:else if def.type === "select"}
        <SelectNative id="cf_{def.key}" name="cf_{def.key}" form={formId}>
          <option value="" selected={!values[def.key]}></option>
          {#each def.options ?? [] as option (option)}
            <option value={option} selected={values[def.key] === option}>{option}</option>
          {/each}
        </SelectNative>
      {:else if def.type === "number"}
        <Input
          type="number"
          id="cf_{def.key}"
          name="cf_{def.key}"
          form={formId}
          value={asString(def.key)}
          step="any"
        />
      {:else if def.type === "date"}
        <Input
          type="date"
          id="cf_{def.key}"
          name="cf_{def.key}"
          form={formId}
          value={asString(def.key)}
        />
      {:else if def.type === "image"}
        <!-- An /uploads/... URL; upload via the Assets page and paste, or use
             an image already attached to the entity. -->
        <Input
          type="text"
          id="cf_{def.key}"
          name="cf_{def.key}"
          form={formId}
          value={asString(def.key)}
          placeholder="/uploads/..."
        />
      {:else}
        <Input
          type="text"
          id="cf_{def.key}"
          name="cf_{def.key}"
          form={formId}
          value={asString(def.key)}
        />
      {/if}
      {#if def.help}
        <p class="mt-1 text-xs text-muted-foreground">{def.help}</p>
      {/if}
    {/if}
  </div>
{/each}
