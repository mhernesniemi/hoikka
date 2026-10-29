// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
import type { Customer } from "#lib/types.js";

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
	}
}

export {};
