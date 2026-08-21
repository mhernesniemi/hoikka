import { beforeNavigate, goto } from "$app/navigation";

export function useUnsavedChanges(isDirty: () => boolean, isSaving?: () => boolean) {
	let showDialog = $state(false);
	let pendingUrl = $state<string | null>(null);
	let confirmedLeave = false;

	$effect(() => {
		const handler = (e: BeforeUnloadEvent) => {
			if (isDirty() && !isSaving?.()) e.preventDefault();
		};
		window.addEventListener("beforeunload", handler);
		return () => window.removeEventListener("beforeunload", handler);
	});

	beforeNavigate(({ cancel, to }) => {
		if (confirmedLeave) {
			confirmedLeave = false;
			return;
		}
		if (isDirty() && !isSaving?.() && to) {
			cancel();
			pendingUrl = to.url.pathname + to.url.search;
			showDialog = true;
		}
	});

	function confirmLeave() {
		showDialog = false;
		if (pendingUrl) {
			confirmedLeave = true;
			goto(pendingUrl);
			pendingUrl = null;
		}
	}

	function cancelLeave() {
		showDialog = false;
		pendingUrl = null;
	}

	return {
		get showDialog() {
			return showDialog;
		},
		set showDialog(v: boolean) {
			showDialog = v;
			if (!v) pendingUrl = null;
		},
		confirmLeave,
		cancelLeave
	};
}
