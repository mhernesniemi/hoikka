/**
 * Disk locations on the node target. Both default under data/, and can be
 * moved (e.g. onto a mounted volume, or the cache out of backups) with
 * UPLOADS_DIR and CACHE_DIR.
 */
import { env } from "$env/dynamic/private";

export const uploadsDir = (): string => env.UPLOADS_DIR || "data/uploads";

/** Resized images; regenerable, so safe to leave out of backups. */
export const cacheDir = (): string => env.CACHE_DIR || `${uploadsDir()}/.cache`;
