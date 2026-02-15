<script lang="ts">
  import { page } from "$app/stores";
</script>

<div class="flex min-h-screen flex-col items-center justify-center text-center font-sans">
  <p class="text-6xl font-bold text-gray-900">{$page.status}</p>
  <p class="mt-3 text-lg text-gray-500">
    {$page.status === 404
      ? "The page you're looking for doesn't exist."
      : $page.error?.message || "Something went wrong."}
  </p>
  <a
    href="/"
    class="mt-6 inline-flex items-center rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
  >
    Back to home
  </a>
</div>
