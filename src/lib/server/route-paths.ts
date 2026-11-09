/** Whether `pathname` is one of `paths` or below one ("/" matches only itself). */
export function matchesPath(pathname: string, paths: readonly string[]): boolean {
	return paths.some(
		(path) =>
			pathname === path ||
			(path !== "/" && pathname.startsWith(path.endsWith("/") ? path : `${path}/`))
	);
}
