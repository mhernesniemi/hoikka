/**
 * Strip dangerous HTML tags and attributes from user-provided HTML.
 * Used for fields rendered with {@html} on the storefront.
 *
 * Backed by the `xss` package (parser + whitelist, works on Node and Workers)
 * rather than regexes, which are bypassable with nested/split tags.
 */
import xss from "xss";

export function sanitizeHtml(html: string): string {
	return xss(html);
}
