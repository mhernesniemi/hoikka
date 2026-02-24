/**
 * Strip dangerous HTML tags and attributes from user-provided HTML.
 * Used for fields rendered with {@html} on the storefront.
 */
const DANGEROUS_TAGS =
	/<\s*\/?\s*(script|iframe|object|embed|form|input|textarea|button|link|meta|base)\b[^>]*>/gi;
const EVENT_ATTRS = /\s+on\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi;
const JAVASCRIPT_URLS = /\b(href|src|action)\s*=\s*["']?\s*javascript:/gi;

export function sanitizeHtml(html: string): string {
	return html.replace(DANGEROUS_TAGS, "").replace(EVENT_ATTRS, "").replace(JAVASCRIPT_URLS, "");
}
