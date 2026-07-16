<script lang="ts">
  import { page } from "$app/state";

  let { children } = $props();
</script>

<!-- Remount the page component when the ID changes so $state initializers re-run with fresh data -->
{#key page.params.id}
  {@render children()}
{/key}
