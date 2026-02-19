<script lang="ts">
  import { enhance } from "$app/forms";
  import { Button } from "$lib/components/admin/ui/button";
  import { Input } from "$lib/components/admin/ui/input";
  import { Label } from "$lib/components/admin/ui/label";

  let { data, form } = $props();

  let isLoading = $state(false);
</script>

<svelte:head><title>Set Up Your Store | Admin</title></svelte:head>

<div class="flex min-h-screen items-center justify-center bg-gray-900 font-sans">
  <div class="w-full max-w-sm">
    <div class="rounded-lg bg-white p-8 shadow-lg">
      <h1 class="mb-2 text-2xl font-bold text-gray-900">Set Up Your Store</h1>
      <p class="mb-6 text-sm text-gray-600">Create your admin account to get started</p>

      {#if !data.authConfigured}
        <div class="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm">
          <p class="font-medium text-amber-800">Neon Auth is not enabled</p>
          <p class="mt-1 text-amber-700">
            To create an admin account, enable Auth in your
            <a
              href="https://console.neon.tech"
              target="_blank"
              rel="noopener noreferrer"
              class="font-medium underline">Neon dashboard</a
            >
            under your project's settings, then redeploy on Vercel.
          </p>
        </div>
      {/if}

      {#if form?.error}
        <div class="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-600">
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
        <div class="mb-4">
          <Label for="name">Name</Label>
          <Input
            type="text"
            id="name"
            name="name"
            value={form?.name ?? ""}
            required
            autocomplete="name"
          />
        </div>

        <div class="mb-4">
          <Label for="email">Email</Label>
          <Input
            type="email"
            id="email"
            name="email"
            value={form?.email ?? ""}
            required
            autocomplete="email"
          />
        </div>

        <div class="mb-6">
          <Label for="password">Password</Label>
          <Input
            type="password"
            id="password"
            name="password"
            required
            minlength={8}
            autocomplete="new-password"
          />
          <p class="mt-1 text-xs text-gray-500">Minimum 8 characters</p>
        </div>

        <Button
          type="submit"
          disabled={isLoading || !data.authConfigured}
          class="w-full bg-gray-900 hover:bg-gray-800"
        >
          {isLoading ? "Creating account..." : "Create admin account"}
        </Button>
      </form>
    </div>
  </div>
</div>
