<script lang="ts">
  import { goto } from "$app/navigation";
  import { authClient } from "$lib/auth-client";
  import { Button } from "$lib/components/storefront/ui/button";
  import { Input } from "$lib/components/storefront/ui/input";
  import { Label } from "$lib/components/storefront/ui/label";

  let step: "email" | "reset" = $state("email");
  let email = $state("");
  let otp = $state("");
  let newPassword = $state("");
  let error = $state<string | null>(null);
  let isLoading = $state(false);

  async function handleSendOtp(e: Event) {
    e.preventDefault();
    error = null;
    isLoading = true;

    try {
      const result = await authClient.emailOtp.sendVerificationOtp({
        email,
        type: "forget-password"
      });
      if (result.error) {
        error = result.error.message ?? "Failed to send reset code";
      } else {
        step = "reset";
      }
    } catch {
      error = "Something went wrong. Please try again.";
    } finally {
      isLoading = false;
    }
  }

  async function handleReset(e: Event) {
    e.preventDefault();
    error = null;
    isLoading = true;

    try {
      const result = await authClient.emailOtp.resetPassword({
        email,
        otp,
        password: newPassword
      });
      if (result.error) {
        error = result.error.message ?? "Failed to reset password";
      } else {
        goto("/sign-in?message=password-reset");
      }
    } catch {
      error = "Something went wrong. Please try again.";
    } finally {
      isLoading = false;
    }
  }
</script>

<svelte:head>
  <title>Forgot Password | Hoikka</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<div class="flex min-h-[60vh] items-center justify-center py-12">
  <div class="w-full max-w-sm px-4">
    <div class="rounded-lg border border-gray-200 bg-white p-8 shadow-sm">
      {#if step === "email"}
        <h1 class="mb-2 text-2xl font-bold text-gray-900">Forgot password</h1>
        <p class="mb-6 text-sm text-gray-600">
          Enter your email and we'll send you a code to reset your password
        </p>

        {#if error}
          <div class="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</div>
        {/if}

        <form onsubmit={handleSendOtp} class="space-y-4">
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

          <Button type="submit" class="w-full" disabled={isLoading}>
            {isLoading ? "Sending code..." : "Send reset code"}
          </Button>
        </form>
      {:else}
        <h1 class="mb-2 text-2xl font-bold text-gray-900">Reset password</h1>
        <p class="mb-6 text-sm text-gray-600">
          Enter the code sent to <span class="font-medium text-gray-900">{email}</span> and your new password
        </p>

        {#if error}
          <div class="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</div>
        {/if}

        <form onsubmit={handleReset} class="space-y-4">
          <div class="space-y-1.5">
            <Label for="otp">Reset code</Label>
            <Input
              type="text"
              id="otp"
              bind:value={otp}
              required
              maxlength={6}
              placeholder="000000"
              autocomplete="one-time-code"
              inputmode="numeric"
              class="text-center text-lg tracking-widest"
            />
          </div>

          <div class="space-y-1.5">
            <Label for="new-password">New password</Label>
            <Input
              type="password"
              id="new-password"
              bind:value={newPassword}
              required
              minlength={8}
              autocomplete="new-password"
            />
            <p class="text-xs text-gray-500">Must be at least 8 characters</p>
          </div>

          <Button type="submit" class="w-full" disabled={isLoading}>
            {isLoading ? "Resetting password..." : "Reset password"}
          </Button>
        </form>
      {/if}

      <p class="mt-4 text-center text-sm text-gray-600">
        <a href="/sign-in" class="font-medium text-gray-900 hover:underline">Back to sign in</a>
      </p>
    </div>
  </div>
</div>
