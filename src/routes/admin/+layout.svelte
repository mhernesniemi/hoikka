<!-- Hoikka route shim - regenerate with `hoikka sync-routes --write`. -->
<script lang="ts">
  import Layout from "@hoikka/core/routes/admin/Layout.svelte";
  let { data, children } = $props();
</script>

<Layout {data} {children} />
