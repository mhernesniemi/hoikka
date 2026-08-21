<script lang="ts">
  // Standalone layout (bypasses the admin shell), but the page uses the
  // token-styled admin UI components — so it needs admin.css and the
  // [data-admin] scope for the theme variables to resolve.
  import "../admin.css";

  let { children } = $props();
</script>

<div data-admin>
  {@render children()}
</div>
