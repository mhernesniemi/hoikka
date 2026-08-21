import { describe, it, expect } from "vitest";
import { calculateTax, calculateTaxExemptPrice, calculateLineTax } from "./tax-utils";

describe("calculateTax", () => {
	it("calculates standard 24% VAT", () => {
		const result = calculateTax(12400, 0.24);
		expect(result.gross).toBe(12400);
		expect(result.net).toBe(10000);
		expect(result.tax).toBe(2400);
	});

	it("calculates food 14% VAT", () => {
		const result = calculateTax(11400, 0.14);
		expect(result.gross).toBe(11400);
		expect(result.net).toBe(10000);
		expect(result.tax).toBe(1400);
	});

	it("handles zero tax rate", () => {
		const result = calculateTax(1000, 0);
		expect(result.gross).toBe(1000);
		expect(result.net).toBe(1000);
		expect(result.tax).toBe(0);
	});

	it("rounds net price correctly", () => {
		// 999 / 1.24 = 805.645... rounds to 806
		const result = calculateTax(999, 0.24);
		expect(result.net).toBe(806);
		expect(result.tax).toBe(193);
	});
});

describe("calculateTaxExemptPrice", () => {
	it("returns net price for 24% VAT", () => {
		expect(calculateTaxExemptPrice(12400, 0.24)).toBe(10000);
	});

	it("returns gross price when tax rate is zero", () => {
		expect(calculateTaxExemptPrice(1000, 0)).toBe(1000);
	});

	it("rounds correctly", () => {
		expect(calculateTaxExemptPrice(999, 0.24)).toBe(806);
	});
});

describe("calculateLineTax", () => {
	it("calculates line total for regular customer", () => {
		const result = calculateLineTax(1240, 3, 0.24, false);
		expect(result.unitPriceGross).toBe(1240);
		expect(result.unitPriceNet).toBe(1000);
		expect(result.lineTotalGross).toBe(3720);
		expect(result.lineTotalNet).toBe(3000);
		expect(result.taxAmount).toBe(720);
	});

	it("calculates line total for tax-exempt customer", () => {
		const result = calculateLineTax(1240, 3, 0.24, true);
		expect(result.unitPriceGross).toBe(1240);
		expect(result.unitPriceNet).toBe(1000);
		expect(result.lineTotalGross).toBe(3000);
		expect(result.lineTotalNet).toBe(3000);
		expect(result.taxAmount).toBe(0);
	});

	it("handles zero tax rate", () => {
		const result = calculateLineTax(1000, 2, 0, false);
		expect(result.lineTotalGross).toBe(2000);
		expect(result.lineTotalNet).toBe(2000);
		expect(result.taxAmount).toBe(0);
	});

	it("handles single quantity", () => {
		const result = calculateLineTax(1240, 1, 0.24, false);
		expect(result.lineTotalGross).toBe(1240);
		expect(result.lineTotalNet).toBe(1000);
		expect(result.taxAmount).toBe(240);
	});
});
