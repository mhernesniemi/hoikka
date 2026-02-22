<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/stores";
  import { authClient } from "$lib/auth-client";
  import { Button } from "$lib/components/storefront/ui/button";
  import { Input } from "$lib/components/storefront/ui/input";
  import { Label } from "$lib/components/storefront/ui/label";
  import { onMount } from "svelte";

  let code = $state("");
  let error = $state<string | null>(null);
  let isLoading = $state(false);
  let isSending = $state(false);
  let cooldown = $state(0);
  let sent = $state(false);

  const email = $derived($page.url.searchParams.get("email") ?? "");
  const redirect = $derived($page.url.searchParams.get("redirect") ?? "/");

  let cooldownInterval: ReturnType<typeof setInterval> | undefined;

  function startCooldown() {
    cooldown = 60;
    clearInterval(cooldownInterval);
    cooldownInterval = setInterval(() => {
      cooldown--;
      if (cooldown <= 0) {
        clearInterval(cooldownInterval);
      }
    }, 1000);
  }

  async function sendOtp() {
    if (!email || isSending || cooldown > 0) return;
    isSending = true;
    error = null;

    try {
      const result = await authClient.emailOtp.sendVerificationOtp({
        email,
        type: "email-verification"
      });
      if (result.error) {
        error = result.error.message ?? "Failed to send verification code";
      } else {
        sent = true;
        startCooldown();
      }
    } catch {
      error = "Failed to send verification code. Please try again.";
    } finally {
      isSending = false;
    }
  }

  async function handleSubmit(e: Event) {
    e.preventDefault();
    error = null;
    isLoading = true;

    try {
      const result = await authClient.emailOtp.verifyEmail({
        email,
        otp: code
      });
      if (result.error) {
        error = result.error.message ?? "Invalid verification code";
      } else {
        // Redirect to sign-in so the user can log in with their verified account
        goto(`/sign-in?verified=true&redirect=${encodeURIComponent(redirect)}`);
      }
    } catch {
      error = "Verification failed. Please try again.";
    } finally {
      isLoading = false;
    }
  }

  onMount(() => {
    if (email) {
      sendOtp();
    }
    return () => clearInterval(cooldownInterval);
  });
</script>

<svelte:head>
  <title>Verify Email | Hoikka</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<div class="flex min-h-[60vh] items-center justify-center py-12">
  <div class="w-full max-w-sm px-4">
    <div class="rounded-lg border border-gray-200 bg-white p-8 shadow-sm">
      <h1 class="mb-2 text-2xl font-bold text-gray-900">Verify your email</h1>
      <p class="mb-6 text-sm text-gray-600">
        {#if sent}
          We sent a 6-digit code to <span class="font-medium text-gray-900">{email}</span>
        {:else}
          Enter the verification code sent to your email
        {/if}
      </p>

      {#if error}
        <div class="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</div>
      {/if}

      <form onsubmit={handleSubmit} class="space-y-4">
        <div class="space-y-1.5">
          <Label for="code">Verification code</Label>
          <Input
            type="text"
            id="code"
            bind:value={code}
            required
            maxlength={6}
            placeholder="000000"
            autocomplete="one-time-code"
            inputmode="numeric"
            class="text-center text-lg tracking-widest"
          />
        </div>

        <Button type="submit" class="w-full" disabled={isLoading || code.length !== 6}>
          {isLoading ? "Verifying..." : "Verify email"}
        </Button>
      </form>

      <div class="mt-4 text-center">
        <Button variant="ghost" size="sm" disabled={cooldown > 0 || isSending} onclick={sendOtp}>
          {#if cooldown > 0}
            Resend code in {cooldown}s
          {:else if isSending}
            Sending...
          {:else}
            Resend code
          {/if}
        </Button>
      </div>

      <p class="mt-4 text-center text-sm text-gray-600">
        <a href="/sign-in" class="font-medium text-gray-900 hover:underline">Back to sign in</a>
      </p>
    </div>
  </div>
</div>
