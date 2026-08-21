/**
 * Category breadcrumb tests against a real in-memory SQLite (full migration
 * chain). getBreadcrumbs runs a raw recursive CTE, so it needs coverage on
 * the node driver in addition to D1.
 */
import { describe, it, expect, beforeAll, vi } from "vitest";

vi.mock("$env/dynamic/private", () => ({ env: { DATABASE_URL: ":memory:" } }));
import { categoryService } from "./categories.js";

describe("category breadcrumbs", () => {
	let rootId: number;
	let leafId: number;

	beforeAll(async () => {
		const root = await categoryService.create({ slug: "food", name: "Food" });
		const mid = await categoryService.create({
			slug: "fruit",
			name: "Fruit",
			parentId: root.id
		});
		const leaf = await categoryService.create({
			slug: "berries",
			name: "Berries",
			parentId: mid.id
		});
		rootId = root.id;
		leafId = leaf.id;
	});

	it("walks from the root down to the requested category", async () => {
		const crumbs = await categoryService.getBreadcrumbs(leafId);
		expect(crumbs.map((c) => c.slug)).toEqual(["food", "fruit", "berries"]);
	});

	it("returns a single crumb for a root category", async () => {
		expect(await categoryService.getBreadcrumbs(rootId)).toEqual([
			{ id: rootId, slug: "food", name: "Food" }
		]);
	});

	it("returns nothing for an unknown category", async () => {
		expect(await categoryService.getBreadcrumbs(99999)).toEqual([]);
	});
});
