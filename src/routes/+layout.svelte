<script lang="ts">
  import "./layout.css";
  import { inject } from "@vercel/analytics";
  import { injectSpeedInsights } from "@vercel/speed-insights/sveltekit";

  inject();
  injectSpeedInsights();

  const { children } = $props();
</script>

{@render children()}
