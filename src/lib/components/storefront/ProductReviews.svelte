<script lang="ts">
  /**
   * Customer reviews section: aggregate rating, review list, and the
   * collapsible submit form (posts to the product page's ?/submitReview
   * action). Owns all review form state — render it under {#key product.id}
   * so state resets per product.
   */
  import { enhance } from "$app/forms";
  import { cn } from "@hoikka/core/shared/utils";
  import { Button } from "$lib/components/storefront/ui/button";
  import { Alert } from "$lib/components/storefront/ui/alert";

  interface ReviewItem {
    nickname: string;
    isVerifiedPurchase: boolean;
    rating: number;
    createdAt: Date | string;
    comment: string | null;
  }

  let {
    reviews,
    rating,
    customerId,
    customerReview,
    productPath,
    form
  }: {
    reviews: ReviewItem[];
    rating: { average: number; count: number };
    customerId: number | null;
    customerReview: { status: string } | null;
    /** Canonical product path, used for the sign-in redirect */
    productPath: string;
    form: { reviewError?: string; reviewSuccess?: boolean } | null;
  } = $props();

  let reviewNickname = $state("");
  let reviewRating = $state(0);
  let reviewComment = $state("");
  let isSubmittingReview = $state(false);
  let hoverRating = $state(0);
  let showReviewForm = $state(false);

  function formatDate(date: Date | string): string {
    return new Date(date).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric"
    });
  }
</script>

<div class="mt-12 border-t border-gray-200 pt-8">
  <!-- Header: title + write a review link -->
  <div class="mb-5 flex items-center justify-between">
    <h2 class="text-xl font-bold">Customer Reviews</h2>
    {#if customerId}
      {#if customerReview}
        <span class="text-sm text-gray-500">
          You've reviewed this product
          {#if customerReview.status === "pending"}
            (pending approval)
          {/if}
        </span>
      {:else}
        <button
          type="button"
          class="text-blue-600 hover:underline"
          onclick={() => (showReviewForm = !showReviewForm)}
        >
          Write a review
        </button>
      {/if}
    {:else}
      <a
        href="/sign-in?redirect={encodeURIComponent(productPath)}"
        class="text-blue-600 hover:underline"
      >
        Write a review
      </a>
    {/if}
  </div>

  <!-- Collapsible Review Form -->
  {#if showReviewForm && customerId && !customerReview}
    <div class="mt-6 mb-8 rounded-lg border bg-gray-50 p-6">
      {#if form?.reviewError}
        <Alert variant="destructive" class="mb-4">{form.reviewError}</Alert>
      {/if}

      {#if form?.reviewSuccess}
        <Alert variant="success" class="mb-4">
          Thank you for your review! It will be visible after approval.
        </Alert>
      {:else}
        <form
          method="POST"
          action="?/submitReview"
          use:enhance={() => {
            isSubmittingReview = true;
            return async ({ update, result }) => {
              isSubmittingReview = false;
              if (result.type === "success") {
                showReviewForm = false;
                reviewNickname = "";
                reviewRating = 0;
                reviewComment = "";
              }
              await update({ reset: false });
            };
          }}
        >
          <div class="mb-4">
            <label for="review-nickname" class="mb-2 block text-sm font-medium text-gray-700">
              Your Nickname <span class="text-red-500">*</span>
            </label>
            <input
              type="text"
              id="review-nickname"
              name="nickname"
              bind:value={reviewNickname}
              required
              maxlength="100"
              class="w-full rounded-lg border border-gray-300 px-3 py-2"
              placeholder="Enter a display name for your review"
            />
          </div>

          <fieldset class="mb-4">
            <legend class="mb-2 block text-sm font-medium text-gray-700"
              >Your Rating <span class="text-red-500">*</span></legend
            >
            <div class="flex gap-1" role="radiogroup" aria-label="Rating">
              {#each [1, 2, 3, 4, 5] as star}
                <button
                  type="button"
                  role="radio"
                  aria-checked={reviewRating === star}
                  aria-label="{star} star{star > 1 ? 's' : ''}"
                  onclick={() => (reviewRating = star)}
                  onmouseenter={() => (hoverRating = star)}
                  onmouseleave={() => (hoverRating = 0)}
                  class={cn(
                    "text-3xl transition-colors",
                    star <= (hoverRating || reviewRating) ? "text-yellow-400" : "text-gray-300"
                  )}
                >
                  ★
                </button>
              {/each}
            </div>
            <input type="hidden" name="rating" value={reviewRating} />
          </fieldset>

          <div class="mb-4">
            <label for="review-comment" class="mb-2 block text-sm font-medium text-gray-700">
              Your Review (optional)
            </label>
            <textarea
              id="review-comment"
              name="comment"
              bind:value={reviewComment}
              rows="4"
              class="w-full rounded-lg border border-gray-300 px-3 py-2"
              placeholder="Share your experience with this product..."></textarea>
          </div>

          <div class="flex items-center gap-3">
            <Button
              type="submit"
              disabled={isSubmittingReview || reviewRating === 0 || !reviewNickname.trim()}
            >
              {isSubmittingReview ? "Submitting..." : "Submit Review"}
            </Button>
            <button
              type="button"
              class="text-sm text-gray-500 hover:text-gray-700"
              onclick={() => (showReviewForm = false)}
            >
              Cancel
            </button>
          </div>
        </form>
      {/if}
    </div>
  {/if}

  <!-- Reviews List -->
  {#if reviews.length > 0}
    <div class="grid grid-cols-1 gap-20 sm:grid-cols-[180px_1fr]">
      <!-- Left column: aggregate rating -->
      <div>
        <div class="flex gap-0.5">
          {#each [1, 2, 3, 4, 5] as star}
            {@const fill = Math.min(1, Math.max(0, rating.average - (star - 1)))}
            <svg class="h-5 w-5 text-amber-400" viewBox="0 0 20 20">
              <defs>
                <clipPath id="star-clip-{star}">
                  <rect x="0" y="0" width={fill * 20} height="20" />
                </clipPath>
              </defs>
              <path
                d="M10 1l2.39 4.84L18 6.71l-4 3.9.94 5.5L10 13.47l-4.94 2.64.94-5.5-4-3.9 5.61-.87z"
                fill="currentColor"
                clip-path="url(#star-clip-{star})"
              />
              <path
                d="M10 1l2.39 4.84L18 6.71l-4 3.9.94 5.5L10 13.47l-4.94 2.64.94-5.5-4-3.9 5.61-.87z"
                fill="none"
                stroke="currentColor"
                stroke-width="1"
              />
            </svg>
          {/each}
        </div>
        <p class="mt-2 text-sm text-gray-500">
          {rating.count}
          {rating.count === 1 ? "review" : "reviews"}
        </p>
      </div>

      <!-- Right column: individual reviews -->
      <div class="divide-y divide-gray-100">
        {#each reviews as review}
          <div class="grid grid-cols-1 gap-10 py-4 first:pt-0 sm:grid-cols-[180px_1fr] sm:gap-6">
            <!-- Reviewer info -->
            <div>
              <p class="text-sm font-medium text-gray-900">{review.nickname}</p>
              {#if review.isVerifiedPurchase}
                <p class="text-xs text-green-600">Verified buyer</p>
              {/if}
              <div class="flex gap-0.5 text-amber-400">
                {#each [1, 2, 3, 4, 5] as star}
                  <span class="text-xl">{star <= review.rating ? "★" : "☆"}</span>
                {/each}
              </div>
              <p class="text-xs text-gray-400">{formatDate(review.createdAt)}</p>
            </div>

            <!-- Comment -->
            <div>
              {#if review.comment}
                <p class="text-sm text-gray-700">{review.comment}</p>
              {/if}
            </div>
          </div>
        {/each}
      </div>
    </div>
  {/if}
</div>
