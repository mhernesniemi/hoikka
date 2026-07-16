// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
import type { Customer } from "$lib/types.js";

declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			user: {
				id: string;
				name: string;
				email: string;
				role?: string;
				emailVerified?: boolean;
			} | null;
			customer: Customer | null;
			adminDark: boolean;
		}
		// interface PageData {}
		// interface PageState {}
		interface Platform {
			env?: {
				DB: import("@cloudflare/workers-types").D1Database;
				ASSETS_BUCKET: import("@cloudflare/workers-types").R2Bucket;
				/** Optional — image resizing falls back to originals without it */
				IMAGES?: import("@cloudflare/workers-types").ImagesBinding;
				/** Optional — guest storefront edge caching is disabled without it */
				CACHE_KV?: import("@cloudflare/workers-types").KVNamespace;
			};
			ctx?: { waitUntil(promise: Promise<unknown>): void };
			caches?: {
				default: {
					match(url: string): Promise<Response | undefined>;
					put(url: string, response: Response): Promise<void>;
				};
			};
		}
	}
}

export {};
