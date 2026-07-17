import { deserialize } from "$app/forms";
import { invalidateAll } from "$app/navigation";

/** Image metadata emitted by ImagePicker once files are uploaded to storage. */
export type SelectedImage = {
	url: string;
	name: string;
	width: number;
	height: number;
	size: number;
	alt: string;
};

/**
 * Submit picker-selected images to a form action in a single request.
 * Each file is serialized as one "files" form entry; the action reads them
 * with formData.getAll("files").
 *
 * On success the server data is refreshed via invalidateAll() and null is
 * returned. On failure an error message is returned for the page to toast.
 */
export async function saveImages(action: string, files: SelectedImage[]): Promise<string | null> {
	const formData = new FormData();
	for (const file of files) {
		formData.append("files", JSON.stringify(file));
	}

	try {
		const response = await fetch(action, {
			method: "POST",
			body: formData,
			headers: { "x-sveltekit-action": "true" }
		});
		const result = deserialize(await response.text());

		if (result.type === "success") {
			await invalidateAll();
			return null;
		}

		if (result.type === "failure") {
			const data = result.data as Record<string, unknown> | undefined;
			const message = data?.error ?? data?.imageError;
			if (typeof message === "string") return message;
		}

		return "Failed to save images";
	} catch (e) {
		return e instanceof Error ? e.message : "Failed to save images";
	}
}
