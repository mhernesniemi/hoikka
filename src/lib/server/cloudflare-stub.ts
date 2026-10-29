/** Stands in for cloudflare.ts on the node target and in unit tests. */
import type { Bindings, EdgeCache } from "./cloudflare.js";

export const bindings: Bindings | null = null;

export function defaultCache(): EdgeCache | null {
	return null;
}

// Node keeps running the promise; there is no request lifetime to extend
export function waitUntil(_promise: Promise<unknown>): void {}
