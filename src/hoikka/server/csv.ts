/**
 * CSV cell encoding shared by the admin exports.
 */

// Cells starting with these are interpreted as formulas by Excel / Sheets /
// LibreOffice. Exports carry customer-controlled text (names, emails, product
// names), so those cells are neutralised with a leading apostrophe.
const FORMULA_START = /^[=+\-@\t\r]/;

export function csvCell(value: unknown): string {
	let text = value == null ? "" : String(value);
	if (FORMULA_START.test(text)) text = `'${text}`;
	return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}
