/**
 * Auth proxy — forwards all /api/auth/* requests to Neon Auth
 * This ensures session cookies are set on our domain, not Neon's
 */
import { env } from "$env/dynamic/private";
import type { RequestHandler } from "./$types";

async function proxy({ request, params }: Parameters<RequestHandler>[0]) {
	const baseUrl = env.NEON_AUTH_BASE_URL;
	if (!baseUrl) {
		console.error("[auth] NEON_AUTH_BASE_URL is not set — auth is disabled");
		return new Response(JSON.stringify({ error: "Auth is not configured" }), {
			status: 503,
			headers: { "Content-Type": "application/json" }
		});
	}

	const url = `${baseUrl}/${params.path}`;

	// Build headers for the upstream request — forward cookies, content type,
	// and the real origin so Neon Auth redirects OAuth callbacks to our app
	const headers = new Headers();
	const contentType = request.headers.get("content-type");
	if (contentType) headers.set("content-type", contentType);
	const cookie = request.headers.get("cookie");
	if (cookie) headers.set("cookie", cookie);
	const referer = request.headers.get("referer");
	if (referer) headers.set("referer", referer);
	const userAgent = request.headers.get("user-agent");
	if (userAgent) headers.set("user-agent", userAgent);

	// For social sign-in, forward the real origin so Neon Auth redirects OAuth
	// callbacks back to our app. For all other routes, use the Neon Auth base URL
	// as origin — Neon Auth always trusts its own URL, avoiding the need to
	// configure trusted domains in the Neon dashboard.
	const isSocialSignIn = params.path.startsWith("sign-in/social");
	const origin = isSocialSignIn
		? request.headers.get("origin") || new URL(request.url).origin
		: baseUrl;
	headers.set("origin", origin);
	headers.set("x-neon-auth-middleware", "true");

	const res = await fetch(url, {
		method: request.method,
		headers,
		body: request.method !== "GET" ? await request.text() : undefined
	});

	// Consume the body fully before returning — streaming the body directly
	// hangs under Bun's dev server because the ReadableStream never closes
	const body = await res.arrayBuffer();

	if (!res.ok) {
		const bodyText = new TextDecoder().decode(body);
		console.error("[auth proxy]", params.path, res.status, bodyText);
	}

	// Forward only the headers we need — passing all upstream headers causes
	// duplicate Date/Connection headers and broken HTTP framing
	const responseHeaders = new Headers();
	const resContentType = res.headers.get("content-type");
	if (resContentType) responseHeaders.set("content-type", resContentType);
	// Forward all Set-Cookie headers for session management
	for (const value of res.headers.getSetCookie()) {
		responseHeaders.append("set-cookie", value);
	}

	return new Response(body, {
		status: res.status,
		headers: responseHeaders
	});
}

export const GET: RequestHandler = proxy;
export const POST: RequestHandler = proxy;
