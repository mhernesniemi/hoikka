<script lang="ts">
  import { goto } from "$app/navigation";
  import { authClient } from "$lib/auth-client";

  let name = $state("");
  let email = $state("");
  let password = $state("");
  let error = $state<string | null>(null);
  let isLoading = $state(false);

  async function handleSubmit(e: Event) {
    e.preventDefault();
    error = null;
    isLoading = true;

    try {
      const result = await authClient.signUp.email({ name, email, password });
      if (result.error) {
        error = result.error.message ?? "Sign up failed";
      } else {
        goto("/");
      }
    } catch {
      error = "Something went wrong. Please try again.";
    } finally {
      isLoading = false;
    }
  }
</script>

<svelte:head>
  <title>Sign Up | Hoikka</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<div class="flex min-h-[60vh] items-center justify-center py-12">
  <div class="w-full max-w-sm">
    <div class="rounded-lg border border-gray-200 bg-white p-8 shadow-sm">
      <h1 class="mb-2 text-2xl font-bold text-gray-900">Create account</h1>
      <p class="mb-6 text-sm text-gray-600">Sign up to get started</p>

      {#if error}
        <div class="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</div>
      {/if}

      <form onsubmit={handleSubmit} class="space-y-4">
        <div>
          <label for="name" class="mb-1 block text-sm font-medium text-gray-700">Name</label>
          <input
            type="text"
            id="name"
            bind:value={name}
            required
            autocomplete="name"
            class="w-full rounded-lg border border-gray-300 px-3 py-2"
          />
        </div>

        <div>
          <label for="email" class="mb-1 block text-sm font-medium text-gray-700">Email</label>
          <input
            type="email"
            id="email"
            bind:value={email}
            required
            autocomplete="email"
            class="w-full rounded-lg border border-gray-300 px-3 py-2"
          />
        </div>

        <div>
          <label for="password" class="mb-1 block text-sm font-medium text-gray-700">Password</label
          >
          <input
            type="password"
            id="password"
            bind:value={password}
            required
            minlength="8"
            autocomplete="new-password"
            class="w-full rounded-lg border border-gray-300 px-3 py-2"
          />
        </div>

        <button
          type="submit"
          disabled={isLoading}
          class="w-full rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
        >
          {isLoading ? "Creating account..." : "Create account"}
        </button>
      </form>

      <p class="mt-4 text-center text-sm text-gray-600">
        Already have an account?
        <a href="/sign-in" class="font-medium text-gray-900 hover:underline">Sign in</a>
      </p>
    </div>
  </div>
</div>
