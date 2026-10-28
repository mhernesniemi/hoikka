/**
 * A client for an external system's API (ERP, PIM): OAuth2 client-credentials
 * tokens, timeouts, retries and OData-style paging. Configuration is passed
 * in, not read from env, so CLI scripts can use it through plain tsx.
 *
 * Retries cover network errors, timeouts and 5xx responses, with backoff, and
 * only for idempotent methods: a POST that timed out may have gone through.
 * 4xx responses are never retried; a 401 refreshes the token once.
 *
 * A server whose certificate comes from a private CA: on the Node target, start
 * the process with NODE_EXTRA_CA_CERTS=/path/to/ca.pem (read once at startup,
 * so it can't go in .env). The Cloudflare target can't trust a custom CA; the
 * API needs a publicly trusted certificate there.
 */

export interface ApiClientOptions {
	baseUrl: string;
	/** OAuth2 client credentials. The token is cached until shortly before it expires. */
	oauth?: { tokenUrl: string; clientId: string; clientSecret: string; scope?: string };
	headers?: Record<string, string>;
	/** Per attempt. Default: 30 s. */
	timeoutMs?: number;
	/** Retries after the first attempt. Default: 2. */
	retries?: number;
	/** First retry delay, doubled on each retry. Default: 500 ms. */
	retryDelayMs?: number;
	fetch?: typeof fetch;
}

export interface CollectionOptions {
	/** Items per page ($top). Default: 500. */
	pageSize?: number;
	/** Fail rather than return a partial pull beyond this many items. Default: 100 000. */
	maxItems?: number;
}

export class ApiError extends Error {
	constructor(
		readonly status: number,
		readonly url: string,
		readonly body: string
	) {
		super(`${status} from ${url}${body ? `: ${body.slice(0, 200)}` : ""}`);
		this.name = "ApiError";
	}
}

const IDEMPOTENT = new Set(["GET", "HEAD", "PUT", "DELETE", "OPTIONS"]);
// Refresh this long before the token's stated expiry, for clock skew and slow requests
const TOKEN_MARGIN_MS = 60_000;

export function createApiClient(options: ApiClientOptions) {
	const fetchFn = options.fetch ?? fetch;
	const timeoutMs = options.timeoutMs ?? 30_000;
	const retries = options.retries ?? 2;
	const retryDelayMs = options.retryDelayMs ?? 500;
	let token: { value: string; expiresAt: number } | null = null;
	let pendingToken: Promise<string> | null = null;

	async function send(url: string, init: RequestInit, retry: boolean): Promise<Response> {
		for (let attempt = 0; ; attempt++) {
			const signal = init.signal
				? AbortSignal.any([init.signal, AbortSignal.timeout(timeoutMs)])
				: AbortSignal.timeout(timeoutMs);
			let response: Response | null = null;
			let error: unknown;
			try {
				response = await fetchFn(url, { ...init, signal });
			} catch (err) {
				if (init.signal?.aborted) throw err;
				error = err;
			}
			if (response && response.status < 500) return response;
			if (!retry || attempt >= retries) {
				if (response) return response;
				throw error;
			}
			await response?.body?.cancel();
			await new Promise((resolve) => setTimeout(resolve, retryDelayMs * 2 ** attempt));
		}
	}

	async function fetchToken(): Promise<string> {
		const { tokenUrl, clientId, clientSecret, scope } = options.oauth!;
		const body = new URLSearchParams({
			grant_type: "client_credentials",
			client_id: clientId,
			client_secret: clientSecret
		});
		if (scope) body.set("scope", scope);
		const response = await send(
			tokenUrl,
			{
				method: "POST",
				headers: { "content-type": "application/x-www-form-urlencoded" },
				body
			},
			true
		);
		if (!response.ok) throw new ApiError(response.status, tokenUrl, await response.text());
		const data = (await response.json()) as { access_token: string; expires_in?: number };
		const lifetimeMs = (data.expires_in ?? 3600) * 1000;
		token = {
			value: data.access_token,
			expiresAt: Date.now() + Math.max(lifetimeMs - TOKEN_MARGIN_MS, lifetimeMs / 2)
		};
		return token.value;
	}

	async function accessToken(fresh: boolean): Promise<string> {
		if (!fresh && token && Date.now() < token.expiresAt) return token.value;
		// Concurrent requests share one token request
		pendingToken ??= fetchToken().finally(() => (pendingToken = null));
		return pendingToken;
	}

	/** A response with a 2xx status; anything else throws an ApiError. */
	async function request(path: string, init: RequestInit = {}): Promise<Response> {
		const url = /^https?:\/\//.test(path)
			? path
			: `${options.baseUrl.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
		const method = (init.method ?? "GET").toUpperCase();
		const attempt = async (fresh: boolean) => {
			const headers = new Headers(options.headers);
			new Headers(init.headers).forEach((value, key) => headers.set(key, value));
			if (options.oauth) headers.set("authorization", `Bearer ${await accessToken(fresh)}`);
			return send(url, { ...init, method, headers }, IDEMPOTENT.has(method));
		};

		let response = await attempt(false);
		if (response.status === 401 && options.oauth) {
			await response.body?.cancel();
			response = await attempt(true);
		}
		if (!response.ok) throw new ApiError(response.status, url, await response.text());
		return response;
	}

	async function json<T>(path: string, init: RequestInit = {}): Promise<T> {
		const headers = new Headers(init.headers);
		if (!headers.has("accept")) headers.set("accept", "application/json");
		return (await request(path, { ...init, headers })).json() as Promise<T>;
	}

	/** Every item of an OData-style collection ({ value: [...] }), paged with $top/$skip. */
	async function collection<T>(path: string, paging: CollectionOptions = {}): Promise<T[]> {
		const pageSize = paging.pageSize ?? 500;
		const maxItems = paging.maxItems ?? 100_000;
		const items: T[] = [];
		for (;;) {
			// Literal $ signs: not every OData server decodes %24top
			const separator = path.includes("?") ? "&" : "?";
			const page = await json<{ value: T[] }>(
				`${path}${separator}$top=${pageSize}&$skip=${items.length}`
			);
			items.push(...page.value);
			if (items.length > maxItems) {
				throw new Error(`${path}: more than ${maxItems} items, refusing a partial pull`);
			}
			if (page.value.length < pageSize) return items;
		}
	}

	return { request, json, collection };
}

export type ApiClient = ReturnType<typeof createApiClient>;
