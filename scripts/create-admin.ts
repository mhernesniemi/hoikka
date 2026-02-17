/**
 * Create an admin user via Neon Auth
 * Runs outside SvelteKit, so we use fetch directly against the Neon Auth API
 */

const NEON_AUTH_BASE_URL = process.env.NEON_AUTH_BASE_URL;
if (!NEON_AUTH_BASE_URL) {
	console.error("NEON_AUTH_BASE_URL environment variable is not set");
	process.exit(1);
}

const prompt = (question: string): Promise<string> => {
	process.stdout.write(question);
	return new Promise((resolve) => {
		process.stdin.setRawMode?.(false);
		process.stdin.resume();
		process.stdin.setEncoding("utf8");
		process.stdin.once("data", (data) => {
			resolve(data.toString().trim());
		});
	});
};

console.log("Create Admin User\n");

const email = await prompt("Email: ");
const password = await prompt("Password: ");
const name = await prompt("Name: ");

if (!email || !password || !name) {
	console.error("\nAll fields are required");
	process.exit(1);
}

try {
	// Create user via Neon Auth sign-up endpoint
	const signUpRes = await fetch(`${NEON_AUTH_BASE_URL}/api/auth/sign-up/email`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ email: email.toLowerCase(), password, name })
	});

	if (!signUpRes.ok) {
		const err = await signUpRes.text();
		console.error(`\nFailed to create user: ${err}`);
		process.exit(1);
	}

	const data = await signUpRes.json();
	const userId = data.user?.id;

	if (!userId) {
		console.error("\nUser created but could not get user ID");
		process.exit(1);
	}

	// Set admin role directly in the database
	const { drizzle } = await import("drizzle-orm/postgres-js");
	const postgres = (await import("postgres")).default;
	const { sql } = await import("drizzle-orm");

	const DATABASE_URL = process.env.DATABASE_URL;
	if (!DATABASE_URL) {
		console.error("DATABASE_URL environment variable is not set");
		process.exit(1);
	}

	const client = postgres(DATABASE_URL);
	const db = drizzle(client);

	// Update the user's role in neon_auth schema
	await db.execute(sql`UPDATE neon_auth."user" SET role = 'admin' WHERE id = ${userId}`);

	await client.end();

	console.log(`\nAdmin user created: ${email} (${name})`);
	process.exit(0);
} catch (error) {
	console.error("\nFailed to create admin user:", error);
	process.exit(1);
}
