/**
 * Request pipeline composition — project-owned. The core handles come from
 * @hoikka/core; add your own before or after them here, e.g.
 *
 *   export const handle = sequence(myHandle, ...hoikkaHandles);
 */
import { sequence } from "@sveltejs/kit/hooks";
import { hoikkaHandles, hoikkaHandleError } from "@hoikka/core/routes/hooks";

export const handle = sequence(...hoikkaHandles);
export const handleError = hoikkaHandleError;
