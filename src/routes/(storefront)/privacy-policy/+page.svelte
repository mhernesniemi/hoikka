<script lang="ts">
  import { STORE_NAME, SUPPORT_EMAIL } from "$lib/config/store.js";
</script>

<svelte:head>
  <title>Privacy Policy | {STORE_NAME}</title>
  <meta name="description" content="Privacy policy and data processing information." />
</svelte:head>

<div class="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
  <h1 class="mb-8 text-3xl font-bold">Privacy Policy</h1>

  <div class="prose max-w-none space-y-8 prose-gray">
    <section>
      <h2 class="text-xl font-semibold">1. Data Controller</h2>
      <p class="mt-2 text-gray-700">
        Hoikka ("we", "us") is the data controller responsible for processing your personal data in
        accordance with the EU General Data Protection Regulation (GDPR).
      </p>
    </section>

    <section>
      <h2 class="text-xl font-semibold">2. What Data We Collect</h2>
      <ul class="mt-2 list-inside list-disc space-y-1 text-gray-700">
        <li>Name and email address (when you create an account or place an order)</li>
        <li>Shipping address (when you place an order for physical products)</li>
        <li>Order history and transaction details</li>
        <li>Product reviews and ratings you submit</li>
        <li>Wishlist data</li>
      </ul>
    </section>

    <section>
      <h2 class="text-xl font-semibold">3. Why We Process Your Data</h2>
      <p class="mt-2 text-gray-700">We process your personal data for the following purposes:</p>
      <ul class="mt-2 list-inside list-disc space-y-1 text-gray-700">
        <li>
          <strong>Order fulfillment</strong> &mdash; to process and deliver your orders (legal basis:
          contract performance)
        </li>
        <li>
          <strong>Account management</strong> &mdash; to maintain your customer account (legal basis:
          contract performance)
        </li>
        <li>
          <strong>Communication</strong> &mdash; to send order confirmations and shipping updates (legal
          basis: legitimate interest)
        </li>
      </ul>
    </section>

    <section>
      <h2 class="text-xl font-semibold">4. Data Retention</h2>
      <p class="mt-2 text-gray-700">
        We retain your personal data for as long as your account is active or as needed to provide
        services. Order data is retained for the period required by applicable accounting and tax
        regulations.
      </p>
    </section>

    <section>
      <h2 class="text-xl font-semibold">5. Data Sharing</h2>
      <p class="mt-2 text-gray-700">
        We do not sell your personal data. We may share data with third-party service providers
        (payment processors, shipping carriers) solely to fulfill your orders. These providers
        process data only on our behalf and under our instructions.
      </p>
    </section>

    <section>
      <h2 class="text-xl font-semibold">6. Your Rights</h2>
      <p class="mt-2 text-gray-700">Under the GDPR, you have the right to:</p>
      <ul class="mt-2 list-inside list-disc space-y-1 text-gray-700">
        <li>Access your personal data</li>
        <li>Rectify inaccurate data</li>
        <li>Request erasure of your data</li>
        <li>Restrict or object to processing</li>
        <li>Data portability</li>
        <li>Lodge a complaint with a supervisory authority</li>
      </ul>
      <p class="mt-2 text-gray-700">
        To exercise any of these rights, please contact us using the details below.
      </p>
    </section>

    <section>
      <h2 class="text-xl font-semibold">7. Analytics</h2>
      <p class="mt-2 text-gray-700">
        We use Vercel Web Analytics to collect anonymous usage data such as page views. This service
        does not use cookies, does not collect personal data, and does not track individual users
        (legal basis: legitimate interest).
      </p>
    </section>

    <section>
      <h2 class="text-xl font-semibold">8. Cookies</h2>
      <p class="mt-2 text-gray-700">
        We use essential cookies only: a session cookie for authentication and a cart token cookie
        for maintaining your shopping cart. These are strictly necessary for the site to function
        and do not require consent.
      </p>
    </section>

    <section>
      <h2 class="text-xl font-semibold">9. Contact</h2>
      <p class="mt-2 text-gray-700">
        For any questions about this privacy policy or your personal data, please contact us at
        <a href="mailto:{SUPPORT_EMAIL}" class="text-blue-600 hover:underline">{SUPPORT_EMAIL}</a>.
      </p>
    </section>

    <p class="mt-8 text-sm text-gray-500">Last updated: February 2026</p>
  </div>
</div>
