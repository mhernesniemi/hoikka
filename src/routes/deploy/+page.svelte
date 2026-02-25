<script>
  import { track } from "@vercel/analytics";
</script>

<svelte:head><title>Deploy Hoikka to Vercel</title></svelte:head>

<div class="flex min-h-screen items-center justify-center bg-gray-50 px-4 font-sans">
  <div class="w-full max-w-md">
    <div class="rounded-lg border border-gray-200 bg-white p-8 shadow-sm">
      <h1 class="text-xl font-bold text-gray-900">Deploy Hoikka</h1>

      <ul class="mt-5 space-y-2 text-sm text-gray-600">
        <li>Enable <strong>Neon Auth</strong> when adding the database</li>
        <li>Set Blob store access to <strong>Public</strong></li>
      </ul>

      <a
        href="https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fmhernesniemi%2Fhoikka&project-name=hoikka&repository-name=hoikka&stores=%5B%7B%22type%22%3A%22integration%22%2C%22productSlug%22%3A%22neon%22%2C%22integrationSlug%22%3A%22neon%22%7D%2C%7B%22type%22%3A%22blob%22%7D%5D&skippable-integrations=1"
        class="mt-5 flex w-full items-center justify-center gap-2.5 rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-gray-800"
        onclick={() => track("deploy_click")}
      >
        Continue to Vercel
        <svg viewBox="0 3.2 24 20.8" fill="currentColor" class="h-4 w-4">
          <path d="M12 3.2 L0 24 L24 24 Z" />
        </svg>
      </a>
    </div>
  </div>
</div>
