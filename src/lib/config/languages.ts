/** Default language — stored directly on entity tables */
export const DEFAULT_LANGUAGE = "en";

/** All supported languages */
export const LANGUAGES = [
	{ code: "en", name: "English" },
	{ code: "fi", name: "Finnish" }
] as const;

/** Languages that use translation tables (everything except default) */
export const TRANSLATION_LANGUAGES = LANGUAGES.filter((l) => l.code !== DEFAULT_LANGUAGE);

/** Convert translation rows into a map: { fi: { name: "...", slug: "..." } } */
export function translationsToMap<T extends { languageCode: string }>(
	rows: T[]
): Record<string, Record<string, string | null>> {
	const map: Record<string, Record<string, string | null>> = {};

	for (const row of rows) {
		const { languageCode, ...fields } = row;
		const fieldMap: Record<string, string | null> = {};

		for (const [key, value] of Object.entries(fields)) {
			if (typeof value === "string" || value === null) {
				fieldMap[key] = value;
			}
		}

		map[languageCode] = fieldMap;
	}

	return map;
}
