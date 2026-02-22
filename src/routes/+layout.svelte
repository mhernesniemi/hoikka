<script lang="ts">
  import "./layout.css";
  import { inject } from "@vercel/analytics";

  inject();

  const { children } = $props();
</script>

{@render children()}
