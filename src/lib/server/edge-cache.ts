/**
 * Edge caching for the guest storefront (cloudflare target only).
 *
 * The invariant: storefront GETs for visitors without an auth session render
 * identically for everyone — cart/wishlist badges hydrate client-side via
 * remote queries and never touch SSR. That makes whole responses (HTML and
 * __data.json) cacheable per (URL, catalog version).
 *
 * Two cache layers, both keyed by (URL, catalog version):
 *  1. the datacenter-local cache API — ~ms hits, but each colo warms alone
 *  2. a global KV mirror — a page renders ONCE worldwide per version; colos
 *     that never saw it serve the KV copy (~50ms) instead of re-rendering.
 * Without layer 2, low-traffic sites pay full SSR for most real visits,
 * because "first visitor per colo per version" describes almost everyone.
 *
 * Invalidation is version-based: catalog mutations bump a version key in KV,
 * which orphans every cached page at once. The version read is edge-cached
 * for 60s, so a change is visible globally within a minute. Entry TTLs
 * backstop writes that bypass the app (e.g. direct D1/wrangler).
 *
 * The version tracks CONTENT only — what an editor changes: descriptions,
 * prices, images, categories. It deliberately does NOT track availability.
 * Stock moves with every paid or cancelled order, and bumping on those would
 * orphan the whole storefront on every sale, forcing cold renders for everyone
 * else precisely when traffic is highest. Stock is read out of band instead
 * ($lib/server/services/availability.ts) and re-validated at checkout, so many
 * visitors share one cached product page while only the small stock query
 * reaches the database.
 *
 * Logged-in visitors always bypass the cache — previews, group prices, and
 * anything else session-dependent stays live by construction.
 */
import { version as buildVersion } from "$app/environment";
import config from "$hoikka/config";
import { getRequestEvent } from "$app/server";
import type { Handle } from "@sveltejs/kit";

const VERSION_KEY = "catalog-version";
const AUTH_COOKIE = "better-auth.session_token";
const BACKSTOP_SECONDS = config.limits.edgeCache.backstopSeconds;
/** KV mirror lives longer — its hit rate is the whole point, and version
 *  bumps (not the TTL) are the real invalidation path */
const KV_TTL_SECONDS = config.limits.edgeCache.kvTtlSeconds;

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
 * Whether a successful non-GET request changed storefront CONTENT and must
 * therefore orphan the cache. Order administration is excluded on purpose: it
 * moves stock, which the storefront reads out of band.
 */
export function invalidatesCatalog(pathname: string): boolean {
	if (pathname === "/api/assets/upload") return true;
	return pathname.startsWith("/admin") && !/^\/admin\/orders(?:\/|$)/.test(pathname);
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

	// Content mutations through the admin UI (form actions) or asset uploads
	// invalidate every cached page at once. Order administration is excluded:
	// it moves stock, not content (see the availability note above).
	if (request.method !== "GET") {
		const response = await resolve(event);
		if (response.ok && invalidatesCatalog(url.pathname)) {
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

	// Keys include the BUILD version as well as the catalog version: cached
	// HTML references hashed asset filenames, and a deploy replaces those —
	// serving a previous build's page 404s its JS and kills hydration.
	const catalogVersion = (await kv.get(VERSION_KEY, { cacheTtl: 60 })) ?? "0";
	const version = `${buildVersion}:${catalogVersion}`;
	const keyPath = `${raw.pathname}${raw.search}`;
	const cacheKey = `${raw.origin}/__edge-cache/${version}${keyPath}`;
	const kvKey = `page:${version}:${keyPath}`;

	const hit = await cache.match(cacheKey);
	if (hit) {
		const headers = new Headers(hit.headers);
		headers.set("x-edge-cache", "hit");
		// The edge revalidates via the version key — browsers must not hold on
		headers.set("cache-control", "private, no-cache");
		return new Response(hit.body, { status: hit.status, headers });
	}

	// Colo miss — the global KV mirror serves what any other colo rendered
	const mirrored = await kv.getWithMetadata<{ ct: string }>(kvKey, { type: "arrayBuffer" });
	if (mirrored?.value) {
		const contentType = mirrored.metadata?.ct ?? "text/html";
		platform.ctx?.waitUntil(
			cache.put(
				cacheKey,
				new Response(mirrored.value.slice(0), {
					headers: {
						"content-type": contentType,
						"cache-control": `public, max-age=${BACKSTOP_SECONDS}`
					}
				})
			)
		);
		return new Response(mirrored.value, {
			headers: {
				"content-type": contentType,
				"x-edge-cache": "kv-hit",
				"cache-control": "private, no-cache"
			}
		});
	}

	const response = await resolve(event);
	// Never store what the app marked as per-user (remote queries are
	// `private, no-cache`) — independent backstop for gate mistakes.
	// Exception: SvelteKit stamps `private, no-store` on EVERY __data.json
	// response as a blanket default, including guest-identical ones — for
	// gate-approved routes the raw-URL gate and the cookie-free-guest
	// invariant are the correctness boundary, so data requests may cache.
	// (Remote-function endpoints — the actual leak risk — never pass the
	// gate in the first place.)
	const isDataRequest = raw.pathname.endsWith("/__data.json");
	const responseCacheControl = response.headers.get("cache-control") ?? "";
	const markedPrivate = /private|no-store|no-cache/.test(responseCacheControl);
	if (
		response.status === 200 &&
		!response.headers.has("set-cookie") &&
		(!markedPrivate || isDataRequest)
	) {
		const clone = response.clone();
		const contentType = response.headers.get("content-type") ?? "text/html";
		const storeHeaders = new Headers(response.headers);
		storeHeaders.set("cache-control", `public, max-age=${BACKSTOP_SECONDS}`);
		platform.ctx?.waitUntil(
			(async () => {
				const body = await clone.arrayBuffer();
				await Promise.all([
					cache.put(cacheKey, new Response(body.slice(0), { headers: storeHeaders })),
					kv.put(kvKey, body, {
						metadata: { ct: contentType },
						expirationTtl: KV_TTL_SECONDS
					})
				]);
			})()
		);
		response.headers.set("x-edge-cache", "miss");
	}
	return response;
};
