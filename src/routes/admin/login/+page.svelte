<script lang="ts">
  import { goto, invalidateAll } from "$app/navigation";
  import { Button } from "$lib/components/admin/ui/button";
  import { Input } from "$lib/components/admin/ui/input";
  import { Label } from "$lib/components/admin/ui/label";
  import { authClient } from "$lib/auth-client";

  let email = $state("");
  let password = $state("");
  let error = $state<string | null>(null);
  let isLoading = $state(false);

  async function handleSubmit(e: Event) {
    e.preventDefault();
    error = null;
    isLoading = true;

    try {
      const result = await authClient.signIn.email({ email, password });
      if (result.error) {
        error = result.error.message ?? "Invalid email or password";
      } else {
        await invalidateAll();
        goto("/admin");
      }
    } catch {
      error = "Invalid email or password";
    } finally {
      isLoading = false;
    }
  }
</script>

<svelte:head><title>Login | Admin</title></svelte:head>

<div class="flex min-h-screen items-center justify-center bg-gray-900 font-sans">
  <div class="w-full max-w-sm">
    <div class="rounded-lg bg-white p-8 shadow-lg">
      <h1 class="mb-2 text-2xl font-bold text-gray-900">Hoikka Admin</h1>
      <p class="mb-6 text-sm text-gray-600">Sign in to your account</p>

      {#if error}
        <div class="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-600">
          {error}
        </div>
      {/if}

      <form onsubmit={handleSubmit}>
        <div class="mb-4">
          <Label for="email">Email</Label>
          <Input type="email" id="email" bind:value={email} required autocomplete="email" />
        </div>

        <div class="mb-6">
          <Label for="password">Password</Label>
          <Input
            type="password"
            id="password"
            bind:value={password}
            required
            autocomplete="current-password"
          />
        </div>

        <Button type="submit" disabled={isLoading} class="w-full bg-gray-900 hover:bg-gray-800">
          {isLoading ? "Signing in..." : "Sign in"}
        </Button>
      </form>
    </div>
  </div>
</div>
