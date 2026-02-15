#!/bin/bash
# Wrapper for Svelte Inspector to open files in Cursor.
# The default Cursor CLI uses eval which breaks on SvelteKit paths
# with special characters like (storefront) and [id].
#
# launch-editor passes: <file> <line> <column>
# We single-quote the file:line:col arg to survive Cursor CLI's eval.
ESCAPED=$(printf "'%s:%s:%s'" "$1" "$2" "$3")
CURSOR_CLI="ELECTRON_RUN_AS_NODE=1 \"/Applications/Cursor.app/Contents/MacOS/Cursor\" \"/Applications/Cursor.app/Contents/Resources/app/out/cli.js\""
eval "$CURSOR_CLI" -r -g "$ESCAPED"
