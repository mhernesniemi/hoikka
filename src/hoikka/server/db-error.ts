/**
 * Extract a user-friendly message from a database error.
 *
 * Both SQLite drivers surface the same message text:
 * - better-sqlite3: SqliteError with message "UNIQUE constraint failed: products.slug"
 * - D1: Error with message "D1_ERROR: UNIQUE constraint failed: products.slug: SQLITE_CONSTRAINT"
 * so we match on the message rather than driver-specific codes.
 * Drizzle wraps the driver error in err.cause, so we check both levels.
 */
export function dbError(err: unknown, fallback: string): string {
	const message = sqliteMessage(err) ?? sqliteMessage((err as { cause?: unknown })?.cause);
	if (!message) return fallback;

	const unique = message.match(/UNIQUE constraint failed: ([\w.]+(?:, [\w.]+)*)/);
	if (unique) {
		// "products.slug" or composite "t.col_a, t.col_b" — the first column names the field
		const col = unique[1].split(",")[0].trim().split(".").pop();
		if (col) {
			const label = FIELD_LABELS[col] ?? col.replace(/_/g, " ");
			return `This ${label} is already in use`;
		}
		return "A record with this value already exists";
	}

	if (message.includes("FOREIGN KEY constraint failed")) {
		return "Cannot complete this action because related data still exists";
	}

	if (message.includes("NOT NULL constraint failed")) {
		return "A required field is missing";
	}

	return fallback;
}

function sqliteMessage(obj: unknown): string | null {
	if (obj && typeof obj === "object" && "message" in obj) {
		const message = (obj as { message: unknown }).message;
		if (typeof message === "string" && message.includes("constraint failed")) {
			return message;
		}
	}
	return null;
}

const FIELD_LABELS: Record<string, string> = {
	sku: "SKU",
	email: "email"
};
