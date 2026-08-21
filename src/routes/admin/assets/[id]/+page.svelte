<!-- Hoikka route shim - regenerate with `hoikka sync-routes --write`. -->
<script lang="ts">
  import Page from "@hoikka/core/routes/admin/assets/[id]/Page.svelte";
  let { data, form } = $props();
</script>

<Page {data} {form} />
