import { describe, it, expect } from "vitest";
import { csvCell } from "./csv.js";

describe("csvCell", () => {
	it("passes plain text through unquoted", () => {
		expect(csvCell("Nordic Chair")).toBe("Nordic Chair");
	});

	it("quotes and escapes separators and quotes", () => {
		expect(csvCell('He said "hi", loudly')).toBe('"He said ""hi"", loudly"');
		expect(csvCell("line1\nline2")).toBe('"line1\nline2"');
	});

	it("neutralises spreadsheet formulas", () => {
		expect(csvCell("=1+1")).toBe("'=1+1");
		expect(csvCell("+34 555 1234")).toBe("'+34 555 1234");
		expect(csvCell("-2+3")).toBe("'-2+3");
		expect(csvCell("@SUM(A1:A2)")).toBe("'@SUM(A1:A2)");
	});

	it("still quotes a neutralised cell that also contains a separator", () => {
		expect(csvCell('=cmd|"/c calc"!A1')).toBe(`"'=cmd|""/c calc""!A1"`);
	});

	it("renders null and undefined as empty", () => {
		expect(csvCell(null)).toBe("");
		expect(csvCell(undefined)).toBe("");
	});
});
