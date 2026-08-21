/**
 * Shared-secret comparison for the handful of endpoints guarded by one.
 */

/**
 * Compare two secrets without leaking their contents through timing. Length is
 * checked first — that much is observable either way — and the rest of the
 * comparison always visits every character.
 */
export function secretMatches(provided: string, expected: string): boolean {
	if (provided.length !== expected.length) return false;
	let diff = 0;
	for (let i = 0; i < provided.length; i++) {
		diff |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
	}
	return diff === 0;
}
