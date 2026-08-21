/**
 * Remote-function bindings — project-owned. SvelteKit's experimental
 * remote functions must live in the app's own .remote.ts files, so this
 * wrapper binds the handlers from @hoikka/core; the logic lives there.
 */
import { query } from "$app/server";
import * as remote from "@hoikka/core/remote/search";

export const quickSearch = query(remote.quickSearchSchema, remote.quickSearch);
