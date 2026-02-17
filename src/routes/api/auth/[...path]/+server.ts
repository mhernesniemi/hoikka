/**
 * Auth proxy — forwards all /api/auth/* requests to Neon Auth
 * This ensures session cookies are set on our domain, not Neon's
 */
import { env } from "$env/dynamic/private";
import type { RequestHandler } from "./$types";

async function proxy({ request, params }: Parameters<RequestHandler>[0]) {
	const baseUrl = env.NEON_AUTH_BASE_URL;
	if (!baseUrl) throw new Error("NEON_AUTH_BASE_URL is not set");

	const url = new URL(`/api/auth/${params.path}`, baseUrl);

	const res = await fetch(url, {
		method: request.method,
		headers: request.headers,
		body: request.method !== "GET" ? await request.text() : undefined
	});

	return new Response(res.body, {
		status: res.status,
		headers: res.headers
	});
}

export const GET: RequestHandler = proxy;
export const POST: RequestHandler = proxy;
