/**
 * Disk locations on the node target. Both default under data/, and can be
 * moved (e.g. onto a mounted volume, or the cache out of backups) with
 * UPLOADS_DIR and CACHE_DIR.
 */
import { UPLOADS_DIR, CACHE_DIR } from "$app/env/private";

export const uploadsDir = (): string => UPLOADS_DIR || "data/uploads";

/** Resized images; regenerable, so safe to leave out of backups. */
export const cacheDir = (): string => CACHE_DIR || `${uploadsDir()}/.cache`;
