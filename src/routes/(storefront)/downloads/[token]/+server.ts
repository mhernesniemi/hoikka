/**
 * Serves a purchased digital product. The token in the URL is the only
 * credential — it is random, expiring and use-limited, and redeeming it
 * increments the use count before a single byte is sent. The underlying
 * asset path is never revealed, and the response is marked private so no
 * cache between here and the buyer keeps a copy.
 */
import { error } from "@sveltejs/kit";
import { digitalDeliveryService } from "$lib/server/services/digitalDelivery.js";
import { get } from "$lib/server/storage/index.js";
import type { RequestHandler } from "./$types.js";

/** Strip the public `/uploads/` prefix to get the storage key. */
function storageKey(source: string): string | null {
	const match = /^\/uploads\/(.+)$/.exec(source);
	return match ? match[1] : null;
}

export const GET: RequestHandler = async ({ params }) => {
	const grant = await digitalDeliveryService.redeem(params.token);
	if (!grant) {
		error(404, "This download link is not valid, has expired, or has been used too many times");
	}

	const key = storageKey(grant.source);
	if (!key) {
		console.error("[downloads] unsupported_asset_source", { source: grant.source });
		error(500, "This file could not be served");
	}

	const file = await get(key);
	if (!file) {
		console.error("[downloads] asset_missing", { key });
		error(404, "File not found");
	}

	return new Response(file.body as BodyInit, {
		headers: {
			"content-type": file.contentType || grant.mimeType,
			"content-length": String(file.size),
			"content-disposition": `attachment; filename="${grant.name.replaceAll('"', "")}"`,
			"cache-control": "private, no-store"
		}
	});
};
