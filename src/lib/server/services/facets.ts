/**
 * Facet Service
 * Handles facets and facet values for product filtering
 */
import { eq, and, desc, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { facets, facetValues, productFacetValues } from "../db/schema.js";
import type { Facet, FacetValue, FacetWithValues, PaginatedResult } from "$lib/types.js";

export class FacetService {
	/**
	 * Create a new facet
	 */
	async create(input: { code: string; name: string; isHidden?: boolean }): Promise<Facet> {
		const [facet] = await db
			.insert(facets)
			.values({
				code: input.code,
				name: input.name,
				isHidden: input.isHidden ?? false
			})
			.returning();

		return facet;
	}

	/**
	 * Get facet by ID with values
	 */
	async getById(id: number): Promise<FacetWithValues | null> {
		const [facet] = await db.select().from(facets).where(eq(facets.id, id));

		if (!facet) return null;

		return this.loadFacetWithValues(facet);
	}

	/**
	 * Get facet by code
	 */
	async getByCode(code: string): Promise<FacetWithValues | null> {
		const [facet] = await db.select().from(facets).where(eq(facets.code, code));

		if (!facet) return null;

		return this.loadFacetWithValues(facet);
	}

	/**
	 * List all facets
	 */
	async list(): Promise<FacetWithValues[]> {
		const facetList = await db.select().from(facets).orderBy(facets.code);

		return Promise.all(facetList.map((f: Facet) => this.loadFacetWithValues(f)));
	}

	/**
	 * Update a facet
	 */
	async update(
		id: number,
		input: {
			code?: string;
			name?: string;
			isHidden?: boolean;
		}
	): Promise<Facet | null> {
		const [facet] = await db.select().from(facets).where(eq(facets.id, id));

		if (!facet) return null;

		const updateData: Record<string, unknown> = {};
		if (input.code) updateData.code = input.code;
		if (input.name !== undefined) updateData.name = input.name;
		if (input.isHidden !== undefined) updateData.isHidden = input.isHidden;

		const [updated] = await db
			.update(facets)
			.set(updateData)
			.where(eq(facets.id, id))
			.returning();

		return updated;
	}

	/**
	 * Delete a facet (cascade deletes values)
	 */
	async delete(id: number): Promise<boolean> {
		await db.delete(facets).where(eq(facets.id, id));
		return true;
	}

	// ============================================================================
	// FACET VALUE METHODS
	// ============================================================================

	/**
	 * Create a facet value
	 */
	async createValue(input: { facetId: number; code: string; name: string }): Promise<FacetValue> {
		const [value] = await db
			.insert(facetValues)
			.values({
				facetId: input.facetId,
				code: input.code,
				name: input.name
			})
			.returning();

		return value;
	}

	/**
	 * Get facet value by ID
	 */
	async getValueById(id: number): Promise<FacetValue | null> {
		const [value] = await db.select().from(facetValues).where(eq(facetValues.id, id));

		return value ?? null;
	}

	/**
	 * Update a facet value
	 */
	async updateValue(
		id: number,
		input: {
			code?: string;
			name?: string;
		}
	): Promise<FacetValue | null> {
		const [value] = await db.select().from(facetValues).where(eq(facetValues.id, id));

		if (!value) return null;

		const updateData: Record<string, unknown> = {};
		if (input.code) updateData.code = input.code;
		if (input.name !== undefined) updateData.name = input.name;

		const [updated] = await db
			.update(facetValues)
			.set(updateData)
			.where(eq(facetValues.id, id))
			.returning();

		return updated;
	}

	/**
	 * Delete a facet value
	 */
	async deleteValue(id: number): Promise<boolean> {
		await db.delete(facetValues).where(eq(facetValues.id, id));
		return true;
	}

	/**
	 * Get products count for a facet value
	 */
	async getValueProductCount(valueId: number): Promise<number> {
		const result = await db
			.select({ count: sql<number>`count(*)` })
			.from(productFacetValues)
			.where(eq(productFacetValues.facetValueId, valueId));

		return Number(result[0]?.count ?? 0);
	}

	// ============================================================================
	// PRIVATE HELPERS
	// ============================================================================

	private async loadFacetWithValues(facet: Facet): Promise<FacetWithValues> {
		// Load values
		const valueList = await db
			.select()
			.from(facetValues)
			.where(eq(facetValues.facetId, facet.id))
			.orderBy(facetValues.code);

		return {
			...facet,
			values: valueList
		};
	}
}

// Export singleton instance
export const facetService = new FacetService();
