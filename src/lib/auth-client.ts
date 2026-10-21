import { createAuthClient } from "better-auth/svelte";
import { emailOTPClient, genericOAuthClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
	plugins: [emailOTPClient(), genericOAuthClient()]
});

export const { signIn, signUp, signOut, useSession } = authClient;
