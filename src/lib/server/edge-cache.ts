/**
 * Edge caching for the guest storefront (cloudflare target only).
 *
 * The invariant: storefront GETs for visitors without an auth session render
 * identically for everyone — cart/wishlist badges hydrate client-side via
 * remote queries and never touch SSR. That makes whole responses (HTML and
 * __data.json) cacheable per (URL, catalog version).
 *
 * Invalidation is version-based: catalog mutations bump a version key in KV,
 * which orphans every cached page at once. The version read is edge-cached
 * for 60s, so a change is visible globally within a minute; a 5-minute TTL
 * on entries backstops writes that bypass the app (e.g. direct D1/wrangler).
 *
 * Logged-in visitors always bypass the cache — previews, group prices, and
 * anything else session-dependent stays live by construction.
 */
import { getRequestEvent } from "$app/server";
import type { Handle } from "@sveltejs/kit";

const VERSION_KEY = "catalog-version";
const AUTH_COOKIE = "better-auth.session_token";
const BACKSTOP_SECONDS = 300;

/** GET routes rendered identically for every guest */
const CACHEABLE =
	/^\/(?:$|products(?:\/|$)|category(?:\/|$)|collections(?:\/|$)|pages(?:\/|$)|privacy-policy\/?$|sitemap\.xml$)/;

type CacheKv = NonNullable<App.Platform["env"]>["CACHE_KV"];

/** SvelteKit data requests cache under the page route they belong to */
function routePath(pathname: string): string {
	return pathname.endsWith("/__data.json")
		? pathname.slice(0, -"/__data.json".length) || "/"
		: pathname;
}

/**
 * Whether a request may be answered from / stored in the shared guest cache.
 * MUST be decided on the RAW request URL, never `event.url`: SvelteKit
 * normalizes event.url for data requests (strips `/__data.json`) and for
 * remote-function requests (reports the *issuing page*, not `/_app/remote/…`).
 * Gating on event.url once cached per-user getCart responses globally.
 */
export function isCacheableRequest(rawUrl: URL, cookieHeader: string | null): boolean {
	return (
		CACHEABLE.test(routePath(rawUrl.pathname)) &&
		!rawUrl.searchParams.has("preview") &&
		!cookieHeader?.includes(AUTH_COOKIE)
	);
}

/**
 * Invalidate all cached storefront pages. Callable from services (uses the
 * request event's KV binding); a no-op outside the cloudflare target.
 */
export async function bumpCatalogVersion(kv?: CacheKv): Promise<void> {
	let namespace = kv ?? null;
	if (!namespace) {
		try {
			namespace = getRequestEvent().platform?.env?.CACHE_KV ?? null;
		} catch {
			namespace = null;
		}
	}
	if (!namespace) return;
	await namespace.put(VERSION_KEY, Date.now().toString(36));
}

export const edgeCache: Handle = async ({ event, resolve }) => {
	const { request, url, platform } = event;
	const cache = platform?.caches?.default;
	const kv = platform?.env?.CACHE_KV;
	if (!cache || !kv) return resolve(event);

	// Catalog mutations through the admin UI (form actions) or asset uploads
	// invalidate every cached page at once
	if (request.method !== "GET") {
		const response = await resolve(event);
		if (
			response.ok &&
			(url.pathname.startsWith("/admin") || url.pathname === "/api/assets/upload")
		) {
			platform.ctx?.waitUntil(bumpCatalogVersion(kv));
		}
		return response;
	}

	const raw = new URL(request.url);
	if (
		!isCacheableRequest(raw, request.headers.get("cookie")) ||
		url.searchParams.has("preview")
	) {
		return resolve(event);
	}

	const version = (await kv.get(VERSION_KEY, { cacheTtl: 60 })) ?? "0";
	const cacheKey = `${raw.origin}/__edge-cache/${version}${raw.pathname}${raw.search}`;

	const hit = await cache.match(cacheKey);
	if (hit) {
		const headers = new Headers(hit.headers);
		headers.set("x-edge-cache", "hit");
		// The edge revalidates via the version key — browsers must not hold on
		headers.set("cache-control", "private, no-cache");
		return new Response(hit.body, { status: hit.status, headers });
	}

	const response = await resolve(event);
	// Never store what the app marked as per-user (remote queries are
	// `private, no-cache`) — independent backstop for gate mistakes
	const responseCacheControl = response.headers.get("cache-control") ?? "";
	const markedPrivate = /private|no-store|no-cache/.test(responseCacheControl);
	if (response.status === 200 && !response.headers.has("set-cookie") && !markedPrivate) {
		const storeHeaders = new Headers(response.headers);
		storeHeaders.set("cache-control", `public, max-age=${BACKSTOP_SECONDS}`);
		platform.ctx?.waitUntil(
			cache.put(cacheKey, new Response(response.clone().body, { headers: storeHeaders }))
		);
		response.headers.set("x-edge-cache", "miss");
	}
	return response;
};
