<script lang="ts">
  import { page } from "$app/stores";

  let { children } = $props();
</script>

{#key $page.params.id}
  {@render children()}
{/key}
