#!/usr/bin/env bash
# Runs svelte-kit sync + svelte-check, then restores the mtimes of unchanged
# .svelte-kit/generated files so a running Vite dev server doesn't see spurious
# changes. Arguments are passed to svelte-check (e.g. --threshold error).
set -euo pipefail

cd "$(dirname "$0")/.."

generated=".svelte-kit/generated"
snapshot="$(mktemp -d)"

restore_mtimes() {
	[ -d "$generated" ] || return 0
	while IFS= read -r -d '' saved; do
		local current="$generated/${saved#"$snapshot"/}"
		if [ -f "$current" ] && cmp -s "$saved" "$current"; then
			touch -r "$saved" "$current"
		fi
	done < <(find "$snapshot" -type f -print0)
}

cleanup() {
	restore_mtimes
	rm -rf "$snapshot"
}
trap cleanup EXIT

if [ -d "$generated" ]; then
	cp -Rp "$generated/." "$snapshot/"
fi

pnpm exec svelte-kit sync
pnpm exec svelte-check --tsconfig ./tsconfig.json "$@"
