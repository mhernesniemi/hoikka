<script lang="ts">
  import { enhance } from "$app/forms";

  let { data, form } = $props();

  let isLoading = $state(false);
</script>

<svelte:head><title>Set Up Your Store</title></svelte:head>

<div class="flex min-h-screen items-center justify-center bg-gray-50 px-4 font-sans">
  <div class="w-full max-w-md">
    <div class="rounded-lg border border-gray-200 bg-white p-8 shadow-sm">
      <h1 class="text-xl font-bold text-gray-900">Set Up Your Store</h1>
      <p class="mt-1 text-sm text-gray-600">Create your admin account to get started</p>

      {#if !data.authConfigured}
        <div class="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm">
          <p class="font-medium text-amber-800">Neon Auth is not enabled</p>
          <ol class="mt-2 list-inside list-decimal space-y-1 text-amber-700">
            <li>
              Open your Vercel project's Neon dashboard, go to <strong>Auth</strong> and enable it
            </li>
            <li>
              Copy the <strong>Auth URL</strong> from Neon and add it as an
              <strong>NEON_AUTH_BASE_URL</strong> environment variable in your Vercel project settings
            </li>
            <li>Redeploy your project</li>
          </ol>
        </div>
      {/if}

      {#if form?.error}
        <div class="mt-5 rounded-lg bg-red-50 p-3 text-sm text-red-600">
          {form.error}
        </div>
      {/if}

      <form
        method="POST"
        action="?/setup"
        use:enhance={() => {
          isLoading = true;
          return async ({ update }) => {
            await update();
            isLoading = false;
          };
        }}
      >
        <div class="mt-5">
          <label for="name" class="block text-sm font-medium text-gray-700">Name</label>
          <input
            type="text"
            id="name"
            name="name"
            value={form?.name ?? ""}
            required
            disabled={!data.authConfigured}
            autocomplete="name"
            class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-500 focus:ring-1 focus:ring-gray-500 focus:outline-none disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400"
          />
        </div>

        <div class="mt-4">
          <label for="email" class="block text-sm font-medium text-gray-700">Email</label>
          <input
            type="email"
            id="email"
            name="email"
            value={form?.email ?? ""}
            required
            disabled={!data.authConfigured}
            autocomplete="email"
            class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-500 focus:ring-1 focus:ring-gray-500 focus:outline-none disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400"
          />
        </div>

        <div class="mt-4">
          <label for="password" class="block text-sm font-medium text-gray-700">Password</label>
          <input
            type="password"
            id="password"
            name="password"
            required
            disabled={!data.authConfigured}
            minlength={8}
            autocomplete="new-password"
            class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-500 focus:ring-1 focus:ring-gray-500 focus:outline-none disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400"
          />
          <p class="mt-1 text-xs text-gray-500">Minimum 8 characters</p>
        </div>

        <button
          type="submit"
          disabled={isLoading || !data.authConfigured}
          class="mt-5 flex w-full cursor-pointer items-center justify-center rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-gray-900"
        >
          {isLoading ? "Creating account..." : "Create admin account"}
        </button>
      </form>
    </div>
  </div>
</div>
