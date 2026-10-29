// The part of cloudflare:workers the app uses. Declared here rather than by
// loading @cloudflare/workers-types globally, which would replace the DOM
// Request/Response types everywhere.
declare module "cloudflare:workers" {
	export const env: object;
	export function waitUntil(promise: Promise<unknown>): void;
}
