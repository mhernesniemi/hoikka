<script lang="ts">
  import { STORE_NAME } from "$lib/config/store.js";
  import { goto, invalidateAll } from "$app/navigation";
  import { Button } from "$lib/components/admin/ui/button";
  import { Input } from "$lib/components/admin/ui/input";
  import { Label } from "$lib/components/admin/ui/label";
  import { authClient } from "$lib/auth-client";

  let { data } = $props();

  let email = $state("");
  let password = $state("");
  let error = $state<string | null>(null);
  let isLoading = $state(false);

  let redirectingTo = $state<string | null>(null);

  async function signInWith(providerId: string) {
    error = null;
    redirectingTo = providerId;
    const result = await authClient.signIn.oauth2({
      providerId,
      callbackURL: "/admin",
      errorCallbackURL: "/admin/login?error=sso"
    });
    if (result.error) {
      error = result.error.message ?? "Single sign-on is not available right now";
      redirectingTo = null;
    }
  }

  async function handleSubmit(e: Event) {
    e.preventDefault();
    error = null;
    isLoading = true;

    try {
      const result = await authClient.signIn.email({ email, password });
      if (result.error) {
        console.error("[admin login]", result.error);
        error = result.error.message ?? "Invalid email or password";
      } else {
        await invalidateAll();
        goto("/admin");
      }
    } catch (e) {
      console.error("[admin login] exception:", e);
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
      <h1 class="mb-2 text-2xl font-bold text-gray-900">{STORE_NAME} Admin</h1>
      <p class="mb-6 text-sm text-gray-600">Sign in to your account</p>

      {#if error || data.ssoError}
        <div class="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-600">
          {error ?? "Your account has no access to the admin. Ask your IT team for a role."}
        </div>
      {/if}

      {#if data.ssoProviders.length > 0}
        <div class="space-y-3">
          {#each data.ssoProviders as provider (provider.id)}
            <Button
              type="button"
              onclick={() => signInWith(provider.id)}
              disabled={redirectingTo !== null}
              class="w-full bg-gray-900 hover:bg-gray-800"
            >
              {redirectingTo === provider.id ? "Redirecting..." : `Sign in with ${provider.label}`}
            </Button>
          {/each}
        </div>
        {#if data.passwordLogin}
          <p class="my-4 text-center text-xs text-gray-500">or with a password</p>
        {/if}
      {/if}

      {#if data.passwordLogin}
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
      {/if}
    </div>
  </div>
</div>
