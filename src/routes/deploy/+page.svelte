<svelte:head><title>Deploy Hoikka to Vercel</title></svelte:head>

<div class="flex min-h-screen items-center justify-center bg-gray-50 px-4 font-sans">
  <div class="w-full max-w-md">
    <div class="rounded-lg border border-gray-200 bg-white p-8 shadow-sm">
      <h1 class="text-xl font-bold text-gray-900">Deploy Hoikka</h1>

      <div class="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm">
        <p class="font-medium text-amber-800">Important: Enable Neon Auth</p>
        <p class="mt-1 text-amber-700">
          When adding the Neon database during setup, make sure to check the
          <strong>"Auth"</strong> checkbox. This is required for admin login.
        </p>
      </div>

      <a
        href="https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fmhernesniemi%2Fsvelte-ecomm&project-name=hoikka&repository-name=hoikka&stores=%5B%7B%22type%22%3A%22integration%22%2C%22productSlug%22%3A%22neon%22%2C%22integrationSlug%22%3A%22neon%22%7D%2C%7B%22type%22%3A%22blob%22%7D%5D&skippable-integrations=1"
        class="mt-5 flex w-full items-center justify-center gap-2.5 rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-gray-800"
      >
        Continue to Vercel
        <svg viewBox="0 3.2 24 20.8" fill="currentColor" class="h-4 w-4">
          <path d="M12 3.2 L0 24 L24 24 Z" />
        </svg>
      </a>
    </div>
  </div>
</div>
