import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import type { Snippet } from "svelte";
import { DATE_LOCALE } from "$lib/config/locale.js";
import config from "$hoikka/config";

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

// Type utilities for shadcn-svelte components
export type WithElementRef<T, E extends HTMLElement = HTMLElement> = T & {
	ref?: E | null;
};

export type WithoutChildrenOrChild<T> = Omit<T, "children" | "child">;

// ============================================================================
// CURRENCY UTILITIES
// ============================================================================

/** The store's currency, from hoikka.config.ts. */
export const BASE_CURRENCY = config.currency.code;

/**
 * Format a price in minor units (cents) to a display string using the store's
 * configured locale (e.g. "29,99 €" for EUR/fi-FI, "$29.99" for USD/en-US).
 */
export function formatPrice(cents: number, currencyCode: string = BASE_CURRENCY): string {
	const amount = cents / 100;
	try {
		return new Intl.NumberFormat(config.currency.locale, {
			style: "currency",
			currency: currencyCode
		}).format(amount);
	} catch {
		// Unknown currency code — plain fallback
		return `${amount.toFixed(2)} ${currencyCode}`;
	}
}

/**
 * Get the symbol for the store currency (or any other ISO code).
 */
export function getCurrencySymbol(currencyCode: string = BASE_CURRENCY): string {
	try {
		const part = new Intl.NumberFormat(config.currency.locale, {
			style: "currency",
			currency: currencyCode
		})
			.formatToParts(1)
			.find((p) => p.type === "currency");
		return part?.value ?? currencyCode;
	} catch {
		return currencyCode;
	}
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
