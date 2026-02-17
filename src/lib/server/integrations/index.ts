/**
 * Integration Utilities
 *
 * Lightweight patterns for integrating external systems (ERP, PIM, etc.)
 *
 * Key Features:
 * - Automatic retry with exponential backoff
 * - Webhook signature verification
 * - Sync patterns for data synchronization
 * - Durable workflows via Vercel Workflow (see /workflows directory)
 */

// Sync Runner
export { runSync, syncSingleItem, type SyncJob, type SyncResults, type SyncError } from "./sync.js";

// Retry Utilities
export { withRetry, isTransientError, createRetryFetch, type RetryOptions } from "./retry.js";

// Webhook Handling
export { verifyHmacSha256, signatureVerifiers } from "./webhooks.js";
