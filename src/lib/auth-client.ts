import { createAuthClient } from "@neondatabase/neon-js/auth";

let _client: ReturnType<typeof createAuthClient> | null = null;

export const authClient = new Proxy({} as ReturnType<typeof createAuthClient>, {
	get(_, prop) {
		if (!_client) {
			_client = createAuthClient(`${window.location.origin}/api/auth`);
		}
		return (_client as any)[prop];
	}
});
