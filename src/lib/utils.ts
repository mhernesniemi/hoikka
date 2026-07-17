import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import type { Snippet } from "svelte";
import { DATE_LOCALE } from "$lib/config/locale.js";

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

// Type utilities for shadcn-svelte components
export type WithElementRef<T, E extends HTMLElement = HTMLElement> = T & {
	ref?: E | null;
};

export type WithoutChildrenOrChild<T> = Omit<T, "children" | "child">;

/**
 * Throttle function calls to max once per wait period
 */
export function throttle<T extends (...args: Parameters<T>) => void>(
	fn: T,
	wait: number
): (...args: Parameters<T>) => void {
	let lastCall = 0;
	let timeout: ReturnType<typeof setTimeout> | null = null;

	return (...args: Parameters<T>) => {
		const now = Date.now();
		const remaining = wait - (now - lastCall);

		if (remaining <= 0) {
			if (timeout) {
				clearTimeout(timeout);
				timeout = null;
			}
			lastCall = now;
			fn(...args);
		} else if (!timeout) {
			timeout = setTimeout(() => {
				lastCall = Date.now();
				timeout = null;
				fn(...args);
			}, remaining);
		}
	};
}

// ============================================================================
// CURRENCY UTILITIES
// ============================================================================

/** Base currency for the system */
export const BASE_CURRENCY = "EUR";

/** Supported currencies with their locale and symbol info */
const CURRENCY_CONFIG: Record<
	string,
	{ locale: string; symbol: string; symbolPosition: "before" | "after" }
> = {
	EUR: { locale: "fi-FI", symbol: "€", symbolPosition: "after" },
	USD: { locale: "en-US", symbol: "$", symbolPosition: "before" },
	GBP: { locale: "en-GB", symbol: "£", symbolPosition: "before" },
	SEK: { locale: "sv-SE", symbol: "kr", symbolPosition: "after" },
	NOK: { locale: "nb-NO", symbol: "kr", symbolPosition: "after" },
	DKK: { locale: "da-DK", symbol: "kr", symbolPosition: "after" }
};

/**
 * Format a price in minor units (cents) to a display string
 *
 * @param cents - Amount in minor units (e.g., 2999 for 29.99)
 * @param currencyCode - ISO 4217 currency code (default: EUR)
 * @returns Formatted price string (e.g., "29.99 €" or "$29.99")
 */
export function formatPrice(cents: number, currencyCode: string = BASE_CURRENCY): string {
	const amount = cents / 100;
	const config = CURRENCY_CONFIG[currencyCode];

	if (config) {
		// Use Intl.NumberFormat for proper locale-aware formatting
		return new Intl.NumberFormat(config.locale, {
			style: "currency",
			currency: currencyCode
		}).format(amount);
	}

	// Fallback for unsupported currencies
	return `${amount.toFixed(2)} ${currencyCode}`;
}

/**
 * Format a price without currency symbol (just the number)
 *
 * @param cents - Amount in minor units
 * @param currencyCode - ISO 4217 currency code for locale
 * @returns Formatted number string (e.g., "29.99")
 */
export function formatPriceNumber(cents: number, currencyCode: string = BASE_CURRENCY): string {
	const amount = cents / 100;
	const config = CURRENCY_CONFIG[currencyCode];
	const locale = config?.locale ?? "en-US";

	return new Intl.NumberFormat(locale, {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2
	}).format(amount);
}

/**
 * Convert price from base currency (EUR) to target currency
 *
 * @param centsInBaseCurrency - Amount in EUR cents
 * @param exchangeRate - Exchange rate from EUR to target currency
 * @returns Amount in target currency cents
 */
export function convertPrice(centsInBaseCurrency: number, exchangeRate: number): number {
	return Math.round(centsInBaseCurrency * exchangeRate);
}

/**
 * Get currency symbol for a currency code
 */
export function getCurrencySymbol(currencyCode: string): string {
	return CURRENCY_CONFIG[currencyCode]?.symbol ?? currencyCode;
}

// ============================================================================
// ORDER STATE LABELS
// ============================================================================

const ORDER_STATE_LABELS: Record<string, string> = {
	created: "Cart",
	payment_pending: "Payment Pending",
	paid: "Paid",
	shipped: "Shipped",
	delivered: "Delivered",
	cancelled: "Cancelled"
};

/**
 * Get a human-friendly label for an order state.
 */
export function orderStateLabel(state: string): string {
	return ORDER_STATE_LABELS[state] ?? state;
}

// ============================================================================
// DATE UTILITIES
// ============================================================================

/**
 * Format a date for display (e.g. "10.2.2026" with fi-FI locale).
 */
export function formatDate(date: Date | string): string {
	return new Intl.DateTimeFormat(DATE_LOCALE, { dateStyle: "short" }).format(new Date(date));
}

/**
 * Format a date with time (e.g. "23.2.2026, 15:13").
 */
export function formatDateTime(date: Date | string): string {
	const d = new Date(date);
	const datePart = new Intl.DateTimeFormat(DATE_LOCALE, {
		day: "numeric",
		month: "numeric",
		year: "numeric"
	}).format(d);
	const hours = d.getHours().toString().padStart(2, "0");
	const minutes = d.getMinutes().toString().padStart(2, "0");
	return `${datePart}, ${hours}:${minutes}`;
}

/**
 * Generate a URL-friendly slug from text
 */
export function slugify(text: string): string {
	return text
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/(^-|-$)/g, "");
}

/**
 * Format bytes into a human-readable file size (e.g. 1.2 MB)
 */
export function formatFileSize(bytes: number): string {
	if (bytes === 0) return "0 B";
	const units = ["B", "KB", "MB", "GB"];
	const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
	const size = bytes / Math.pow(1024, i);
	return `${i === 0 ? size : size.toFixed(1)} ${units[i]}`;
}

/**
 * Strip HTML tags from a string (for meta descriptions, etc.)
 */
export function stripHtml(html: string | null | undefined): string {
	if (!html) return "";
	return html.replace(/<[^>]*>/g, "").trim();
}

/**
 * Human-readable message from a failed remote command. Expected business
 * errors are thrown server-side with `error(400, message)` and arrive as an
 * HttpError whose body carries the message; anything else falls back.
 */
export function commandErrorMessage(e: unknown, fallback = "Something went wrong"): string {
	if (e && typeof e === "object" && "body" in e) {
		const body = (e as { body?: { message?: string } }).body;
		if (body?.message) return body.message;
	}
	return e instanceof Error && e.message ? e.message : fallback;
}
