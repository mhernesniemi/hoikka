import { sleep } from "workflow";

export async function reservationCleanup() {
	"use workflow";
	while (true) {
		await cleanupExpiredReservations();
		await sleep("15m");
	}
}

async function cleanupExpiredReservations() {
	"use step";
	const { reservationService } = await import("$lib/server/services/reservations.js");
	const count = await reservationService.cleanupExpired();
	return { cleaned: count };
}
