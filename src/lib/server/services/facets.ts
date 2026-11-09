/**
 * Facet Service
 * Handles facets and facet values for product filtering
 */
import { eq, and, sql, count, type SQL } from "drizzle-orm";
import { db } from "../db/index.js";
import { paginationOf, resolveSort } from "../pagination.js";
import { facets, facetValues, productFacetValues } from "../db/schema.js";
import type {
	Facet,
	FacetListItem,
	FacetValue,
	FacetWithValues,
	PaginatedResult
} from "#lib/types.js";

export class FacetService {
	/**
	 * Create a new facet
	 */
	async create(input: {
		code: string;
		name: string;
		isHidden?: boolean;
		searchable?: boolean;
	}): Promise<Facet> {
		const [facet] = await db
			.insert(facets)
			.values({
				code: input.code,
				name: input.name,
				isHidden: input.isHidden ?? false,
				searchable: input.searchable ?? false
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
		const facetList = await db.select().from(facets).orderBy(facets.position, facets.code);

		return Promise.all(facetList.map((f: Facet) => this.loadFacetWithValues(f)));
	}

	/**
	 * List facets with server-side pagination for admin list view.
	 */
	async listPaginated(
		options: {
			limit?: number;
			offset?: number;
			search?: string;
			sortBy?: string;
			sortOrder?: "asc" | "desc";
		} = {}
	): Promise<PaginatedResult<FacetListItem>> {
		const { limit = 20, offset = 0, search, sortBy, sortOrder = "asc" } = options;

		const conditions: SQL[] = [];
		if (search) {
			const pattern = `%${search}%`;
			conditions.push(
				sql`(${facets.name} LIKE ${pattern} OR ${facets.code} LIKE ${pattern})`
			);
		}

		const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

		const [countResult] = await db
			.select({ count: sql<number>`count(*)` })
			.from(facets)
			.where(whereClause);
		const total = Number(countResult?.count ?? 0);

		const orderByExpr = resolveSort(
			{
				name: sql`${facets.name}`,
				code: sql`${facets.code}`
			},
			sortBy,
			sortOrder,
			sql`${facets.code}`
		);

		const items = await db
			.select({
				id: facets.id,
				name: facets.name,
				code: facets.code,
				valueCount: sql<number>`(${db
					.select({ value: count() })
					.from(facetValues)
					.where(eq(facetValues.facetId, facets.id))})`
			})
			.from(facets)
			.where(whereClause)
			.orderBy(orderByExpr)
			.limit(limit)
			.offset(offset);

		return {
			items: items.map((item) => ({ ...item, valueCount: Number(item.valueCount) })),
			pagination: paginationOf(total, limit, offset, items.length)
		};
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
			searchable?: boolean;
			position?: number;
		}
	): Promise<Facet | null> {
		const [facet] = await db.select().from(facets).where(eq(facets.id, id));

		if (!facet) return null;

		const updateData: Record<string, unknown> = {};
		if (input.code) updateData.code = input.code;
		if (input.name !== undefined) updateData.name = input.name;
		if (input.isHidden !== undefined) updateData.isHidden = input.isHidden;
		if (input.searchable !== undefined) updateData.searchable = input.searchable;
		if (input.position !== undefined) updateData.position = input.position;

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
	async createValue(input: {
		facetId: number;
		code: string;
		name: string;
		position?: number;
	}): Promise<FacetValue> {
		const [value] = await db
			.insert(facetValues)
			.values({
				facetId: input.facetId,
				code: input.code,
				name: input.name,
				position: input.position ?? 0
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
			position?: number;
		}
	): Promise<FacetValue | null> {
		const [value] = await db.select().from(facetValues).where(eq(facetValues.id, id));

		if (!value) return null;

		const updateData: Record<string, unknown> = {};
		if (input.code) updateData.code = input.code;
		if (input.name !== undefined) updateData.name = input.name;
		if (input.position !== undefined) updateData.position = input.position;

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

	/** Products carrying any value of a facet (to reindex after its search text changes). */
	async getProductIds(facetId: number): Promise<number[]> {
		const rows = await db
			.selectDistinct({ productId: productFacetValues.productId })
			.from(productFacetValues)
			.innerJoin(facetValues, eq(productFacetValues.facetValueId, facetValues.id))
			.where(eq(facetValues.facetId, facetId));
		return rows.map((r) => r.productId);
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
			.orderBy(facetValues.position, facetValues.code);

		return {
			...facet,
			values: valueList
		};
	}
}

// Export singleton instance
export const facetService = new FacetService();
