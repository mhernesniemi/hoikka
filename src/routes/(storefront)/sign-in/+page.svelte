<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/stores";
  import { authClient } from "$lib/auth-client";
  import { Button } from "$lib/components/storefront/ui/button";
  import { Input } from "$lib/components/storefront/ui/input";
  import { Label } from "$lib/components/storefront/ui/label";
  import { Separator } from "$lib/components/storefront/ui/separator";

  let email = $state("");
  let password = $state("");
  let error = $state<string | null>(null);
  let isLoading = $state(false);
  let isGoogleLoading = $state(false);

  const successMessage = $derived.by(() => {
    if ($page.url.searchParams.get("verified") === "true") {
      return "Email verified! Sign in to continue.";
    }
    if ($page.url.searchParams.get("message") === "password-reset") {
      return "Password reset successfully. Sign in with your new password.";
    }
    return null;
  });

  async function handleSubmit(e: Event) {
    e.preventDefault();
    error = null;
    isLoading = true;

    try {
      const result = await authClient.signIn.email({ email, password });
      if (result.error) {
        error = result.error.message ?? "Invalid email or password";
      } else {
        if (result.data?.user?.emailVerified === false) {
          goto(`/verify-email?email=${encodeURIComponent(email)}`);
        } else {
          const redirect = $page.url.searchParams.get("redirect") ?? "/";
          goto(redirect);
        }
      }
    } catch {
      error = "Something went wrong. Please try again.";
    } finally {
      isLoading = false;
    }
  }

  async function handleGoogleSignIn() {
    isGoogleLoading = true;
    error = null;

    try {
      await authClient.signIn.social({
        provider: "google",
        callbackURL: $page.url.searchParams.get("redirect") ?? "/"
      });
    } catch {
      error = "Google sign-in failed. Please try again.";
      isGoogleLoading = false;
    }
  }
</script>

<svelte:head>
  <title>Sign In | Hoikka</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<div class="flex min-h-[60vh] items-center justify-center py-12">
  <div class="w-full max-w-sm px-4">
    <div class="rounded-lg border border-gray-200 bg-white p-8 shadow-sm">
      <h1 class="mb-2 text-2xl font-bold text-gray-900">Sign in</h1>
      <p class="mb-6 text-sm text-gray-600">Welcome back</p>

      {#if successMessage}
        <div class="mb-4 rounded-lg bg-green-50 p-3 text-sm text-green-700">{successMessage}</div>
      {/if}

      {#if error}
        <div class="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</div>
      {/if}

      <Button
        variant="outline"
        class="w-full"
        disabled={isGoogleLoading}
        onclick={handleGoogleSignIn}
      >
        <svg class="h-5 w-5" viewBox="0 0 24 24">
          <path
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
            fill="#4285F4"
          />
          <path
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            fill="#34A853"
          />
          <path
            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
            fill="#FBBC05"
          />
          <path
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            fill="#EA4335"
          />
        </svg>
        {isGoogleLoading ? "Redirecting..." : "Sign in with Google"}
      </Button>

      <div class="relative my-6 flex items-center">
        <Separator class="flex-1" />
        <span class="px-3 text-sm text-gray-500">or continue with email</span>
        <Separator class="flex-1" />
      </div>

      <form onsubmit={handleSubmit} class="space-y-4">
        <div class="space-y-1.5">
          <Label for="email">Email</Label>
          <Input
            type="email"
            id="email"
            bind:value={email}
            required
            autocomplete="email"
            placeholder="you@example.com"
          />
        </div>

        <div class="space-y-1.5">
          <div class="flex items-center justify-between">
            <Label for="password">Password</Label>
            <a href="/forgot-password" class="text-sm text-gray-500 hover:text-gray-900">
              Forgot password?
            </a>
          </div>
          <Input
            type="password"
            id="password"
            bind:value={password}
            required
            autocomplete="current-password"
          />
        </div>

        <Button type="submit" class="w-full" disabled={isLoading}>
          {isLoading ? "Signing in..." : "Sign in"}
        </Button>
      </form>

      <p class="mt-4 text-center text-sm text-gray-600">
        Don't have an account?
        <a href="/sign-up" class="font-medium text-gray-900 hover:underline">Sign up</a>
      </p>
    </div>
  </div>
</div>
