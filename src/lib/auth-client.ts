import { createAuthClient, type VanillaBetterAuthClient } from "@neondatabase/neon-js/auth";

let _client: VanillaBetterAuthClient | null = null;

function getClient(): VanillaBetterAuthClient {
	if (!_client) {
		_client = createAuthClient(
			`${window.location.origin}/api/auth`
		) as unknown as VanillaBetterAuthClient;
	}
	return _client;
}

export const authClient = new Proxy({} as VanillaBetterAuthClient, {
	get(_, prop) {
		return (getClient() as any)[prop];
	}
});
