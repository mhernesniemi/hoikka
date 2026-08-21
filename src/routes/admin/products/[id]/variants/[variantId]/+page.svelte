<!-- Hoikka route shim - regenerate with `hoikka sync-routes --write`. -->
<script lang="ts">
  import Page from "@hoikka/core/routes/admin/products/[id]/variants/[variantId]/Page.svelte";
  let { data, form } = $props();
</script>

<Page {data} {form} />
