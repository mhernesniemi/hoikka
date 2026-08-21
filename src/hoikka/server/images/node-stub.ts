/**
 * Build-time stand-in for node.ts on the cloudflare target — keeps sharp out
 * of the Workers bundle. See the `resolve.alias` block in vite.config.ts.
 */
export function resizeImage(): never {
	throw new Error("sharp resizing is not available on the cloudflare target");
}

export function optimizeMasterImage(): never {
	throw new Error("sharp resizing is not available on the cloudflare target");
}
