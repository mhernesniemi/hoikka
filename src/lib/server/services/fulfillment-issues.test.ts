/**
 * fulfillmentError stores one owned line per problem source. The contract is
 * only as strong as the line boundaries, so a message must not be able to
 * smuggle in a second line — least of all one wearing another source's label.
 */
import { describe, it, expect } from "vitest";
import { mergeFulfillmentIssue } from "./orders.js";

describe("mergeFulfillmentIssue", () => {
	it("keeps one line per source, replacing on rewrite", () => {
		let stored = mergeFulfillmentIssue(null, "shipment", "carrier down");
		stored = mergeFulfillmentIssue(stored, "downloads", "file missing");
		stored = mergeFulfillmentIssue(stored, "shipment", "carrier still down");

		expect(stored).toBe("Downloads: file missing\nShipment: carrier still down");
	});

	it("clears only the named source", () => {
		let stored = mergeFulfillmentIssue(null, "shipment", "carrier down");
		stored = mergeFulfillmentIssue(stored, "downloads", "file missing");
		stored = mergeFulfillmentIssue(stored, "delivery-email", null);
		stored = mergeFulfillmentIssue(stored, "downloads", null);

		expect(stored).toBe("Shipment: carrier down");
	});

	it("returns null once nothing is left", () => {
		const stored = mergeFulfillmentIssue("Shipment: x", "shipment", null);
		expect(stored).toBeNull();
	});

	it("flattens newlines so a message cannot spoof another source", () => {
		const hostile = "boom\nDownloads: everything is fine";
		let stored = mergeFulfillmentIssue(null, "downloads", "file missing");
		stored = mergeFulfillmentIssue(stored, "settlement", hostile);

		// The downloads line survives untouched; the hostile message stays one line
		expect(stored).toContain("Downloads: file missing");
		expect(stored).toContain("Settlement: boom — Downloads: everything is fine");
		// ...and clearing settlement removes all of it
		stored = mergeFulfillmentIssue(stored, "settlement", null);
		expect(stored).toBe("Downloads: file missing");
	});
});
