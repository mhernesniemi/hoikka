/**
 * Create an admin user via Better Auth.
 * Run with: bun scripts/create-admin.ts
 */
import { auth } from "../src/lib/server/auth.js";
import { db } from "../src/lib/server/db/index.js";
import { user } from "../src/lib/server/db/schema.js";
import { eq } from "drizzle-orm";

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
	const result = await auth.api.signUpEmail({
		body: { email: email.toLowerCase(), password, name }
	});

	await db
		.update(user)
		.set({ role: "admin", emailVerified: true })
		.where(eq(user.id, result.user.id));

	console.log(`\nAdmin user created: ${email} (${name})`);
	process.exit(0);
} catch (error) {
	console.error("\nFailed to create admin user:", error);
	process.exit(1);
}
