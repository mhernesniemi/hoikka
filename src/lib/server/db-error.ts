/**
 * Extract a user-friendly message from a database error.
 * Handles PostgreSQL error codes like unique-constraint violations.
 * Drizzle wraps the original NeonDbError in err.cause, so we check both levels.
 */
export function dbError(err: unknown, fallback: string): string {
	const pg = extractPgError(err) ?? extractPgError((err as { cause?: unknown })?.cause);
	if (!pg) return fallback;

	if (pg.code === "23505") {
		const match = pg.message?.match(
			/unique constraint "(\w+)"|Key \((\w+)\)=\((.+?)\) already exists/
		);
		if (match) {
			const constraint = match[1];
			const field = match[2];
			const value = match[3];
			if (field && value) {
				const label = FIELD_LABELS[field] ?? formatColumn(field);
				return `${label} "${value}" is already in use`;
			}
			if (constraint) {
				const col = constraint
					.replace(/_idx$|_unique$|_key$/, "")
					.split("_")
					.pop();
				if (col) {
					const label = FIELD_LABELS[col] ?? formatColumn(col);
					return `This ${label.toLowerCase()} is already in use`;
				}
			}
		}
		return "A record with this value already exists";
	}

	if (pg.code === "23503") {
		return "Cannot complete this action because related data still exists";
	}

	return fallback;
}

function extractPgError(obj: unknown): { code: string; message?: string } | null {
	if (
		obj &&
		typeof obj === "object" &&
		"code" in obj &&
		typeof (obj as { code: unknown }).code === "string"
	) {
		const { code, message, detail } = obj as {
			code: string;
			message?: string;
			detail?: string;
		};
		return { code, message: detail ?? message };
	}
	return null;
}

const FIELD_LABELS: Record<string, string> = {
	sku: "SKU",
	email: "Email"
};

function formatColumn(col: string): string {
	return col.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
