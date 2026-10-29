/**
 * Cloudflare bindings, the edge cache and waitUntil on the cloudflare target.
 * The node build and the unit tests get cloudflare-stub.ts instead (see
 * vite.config.ts), which has none, so callers check `bindings` first.
 */
import { env, waitUntil } from "cloudflare:workers";
import type { D1Database, ImagesBinding, KVNamespace, R2Bucket } from "@cloudflare/workers-types";

export interface Bindings {
	DB: D1Database;
	ASSETS_BUCKET: R2Bucket;
	/** Optional — image resizing falls back to originals without it */
	IMAGES?: ImagesBinding;
	/** Optional — guest storefront edge caching is disabled without it */
	CACHE_KV?: KVNamespace;
}

/** The Workers default cache, typed with the DOM Request/Response the app uses. */
export interface EdgeCache {
	match(url: string): Promise<Response | undefined>;
	put(url: string, response: Response): Promise<void>;
}

export const bindings: Bindings | null = env as Bindings;

export function defaultCache(): EdgeCache | null {
	return (globalThis as { caches?: { default?: EdgeCache } }).caches?.default ?? null;
}

export { waitUntil };
