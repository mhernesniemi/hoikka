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
			wishlistToken: string | null;
			newWishlistToken?: string;
			adminDark: boolean;
		}
		// interface PageData {}
		// interface PageState {}
		interface Platform {
			env?: {
				DB: import("@cloudflare/workers-types").D1Database;
				ASSETS_BUCKET: import("@cloudflare/workers-types").R2Bucket;
			};
		}
	}
}

export {};
