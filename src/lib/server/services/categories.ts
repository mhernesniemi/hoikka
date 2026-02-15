/**
 * Category Service
 * Handles hierarchical product categories for navigation and breadcrumbs
 */
import { eq, and, isNull, asc, inArray, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { categories, productCategories } from "../db/schema.js";

export type Category = typeof categories.$inferSelect;

export type CategoryTreeNode = Category & {
	children: CategoryTreeNode[];
};

export type CategoryBreadcrumb = {
	id: number;
	slug: string;
	name: string;
};

export class CategoryService {
	/**
	 * Create a new category
	 */
	async create(input: {
		slug: string;
		name: string;
		parentId?: number | null;
		position?: number;
		taxCode?: string;
	}): Promise<Category> {
		const [category] = await db
			.insert(categories)
			.values({
				slug: input.slug,
				name: input.name,
				parentId: input.parentId ?? null,
				position: input.position ?? 0,
				taxCode: input.taxCode ?? "standard"
			})
			.returning();

		return category;
	}

	/**
	 * Get category by ID
	 */
	async getById(id: number): Promise<Category | null> {
		const category = await db.query.categories.findFirst({
			where: eq(categories.id, id)
		});

		return category ?? null;
	}

	/**
	 * Get category by slug
	 */
	async getBySlug(slug: string): Promise<Category | null> {
		const category = await db.query.categories.findFirst({
			where: eq(categories.slug, slug)
		});

		return category ?? null;
	}

	/**
	 * Get all root categories (no parent)
	 */
	async getRoots(): Promise<Category[]> {
		return db.query.categories.findMany({
			where: isNull(categories.parentId),
			orderBy: [asc(categories.position), asc(categories.id)]
		});
	}

	/**
	 * Get children of a category
	 */
	async getChildren(parentId: number): Promise<Category[]> {
		return db.query.categories.findMany({
			where: eq(categories.parentId, parentId),
			orderBy: [asc(categories.position), asc(categories.id)]
		});
	}

	/**
	 * Build full category tree
	 */
	async getTree(): Promise<CategoryTreeNode[]> {
		const allCategories = await db.query.categories.findMany({
			orderBy: [asc(categories.position), asc(categories.id)]
		});

		return this.buildTree(allCategories, null);
	}

	private buildTree(allCategories: Category[], parentId: number | null): CategoryTreeNode[] {
		return allCategories
			.filter((c) => c.parentId === parentId)
			.map((c) => ({
				...c,
				children: this.buildTree(allCategories, c.id)
			}));
	}

	/**
	 * Get breadcrumb path from root to category
	 */
	async getBreadcrumbs(categoryId: number): Promise<CategoryBreadcrumb[]> {
		const breadcrumbs: CategoryBreadcrumb[] = [];
		let currentId: number | null = categoryId;

		while (currentId !== null) {
			const category: Category | undefined = await db.query.categories.findFirst({
				where: eq(categories.id, currentId)
			});

			if (!category) break;

			breadcrumbs.unshift({
				id: category.id,
				slug: category.slug,
				name: category.name
			});

			currentId = category.parentId;
		}

		return breadcrumbs;
	}

	/**
	 * Get all descendant category IDs (for filtering products)
	 */
	async getDescendantIds(categoryId: number): Promise<number[]> {
		const ids: number[] = [categoryId];
		let currentIds = [categoryId];

		while (currentIds.length > 0) {
			const children = await db.query.categories.findMany({
				where: inArray(categories.parentId, currentIds),
				columns: { id: true }
			});

			currentIds = children.map((c) => c.id);
			ids.push(...currentIds);
		}

		return ids;
	}

	/**
	 * Update a category
	 */
	async update(
		id: number,
		input: {
			slug?: string;
			name?: string;
			parentId?: number | null;
			position?: number;
			taxCode?: string;
		}
	): Promise<Category | null> {
		const updateData: Record<string, unknown> = {};
		if (input.slug !== undefined) updateData.slug = input.slug;
		if (input.name !== undefined) updateData.name = input.name;
		if (input.parentId !== undefined) updateData.parentId = input.parentId;
		if (input.position !== undefined) updateData.position = input.position;
		if (input.taxCode !== undefined) updateData.taxCode = input.taxCode;

		if (Object.keys(updateData).length > 0) {
			await db.update(categories).set(updateData).where(eq(categories.id, id));
		}

		return this.getById(id);
	}

	/**
	 * Delete a category and all its descendants
	 */
	async delete(id: number): Promise<void> {
		const ids = await this.getDescendantIds(id);
		await db.delete(categories).where(inArray(categories.id, ids));
	}

	/**
	 * Assign product to category
	 */
	async addProduct(categoryId: number, productId: number): Promise<void> {
		await db.insert(productCategories).values({ categoryId, productId }).onConflictDoNothing();
	}

	/**
	 * Remove product from category
	 */
	async removeProduct(categoryId: number, productId: number): Promise<void> {
		await db
			.delete(productCategories)
			.where(
				and(
					eq(productCategories.categoryId, categoryId),
					eq(productCategories.productId, productId)
				)
			);
	}

	/**
	 * Get all categories for a product
	 */
	async getProductCategories(productId: number): Promise<Category[]> {
		const result = await db.query.productCategories.findMany({
			where: eq(productCategories.productId, productId),
			with: {
				category: true
			}
		});

		return result.map((pc) => pc.category);
	}

	/**
	 * Set categories for a product (replaces existing)
	 */
	async setProductCategories(productId: number, categoryIds: number[]): Promise<void> {
		await db.delete(productCategories).where(eq(productCategories.productId, productId));

		if (categoryIds.length > 0) {
			await db
				.insert(productCategories)
				.values(categoryIds.map((categoryId) => ({ productId, categoryId })));
		}
	}

	/**
	 * Get products in category (including subcategories)
	 */
	async getProducts(
		categoryId: number,
		options: { limit?: number; offset?: number } = {}
	): Promise<{ products: number[]; total: number }> {
		const descendantIds = await this.getDescendantIds(categoryId);

		const [countResult] = await db
			.select({ count: sql<number>`count(distinct ${productCategories.productId})` })
			.from(productCategories)
			.where(inArray(productCategories.categoryId, descendantIds));

		const total = Number(countResult?.count ?? 0);

		const result = await db
			.selectDistinct({ productId: productCategories.productId })
			.from(productCategories)
			.where(inArray(productCategories.categoryId, descendantIds))
			.limit(options.limit ?? 20)
			.offset(options.offset ?? 0);

		return {
			products: result.map((r) => r.productId),
			total
		};
	}

	/**
	 * List all categories flat (for admin)
	 */
	async list(): Promise<Category[]> {
		return db.query.categories.findMany({
			orderBy: [asc(categories.position), asc(categories.id)]
		});
	}

	/**
	 * Get tax code for a product based on its first assigned category.
	 * Returns "standard" if the product has no categories.
	 */
	async getProductTaxCode(productId: number): Promise<string> {
		const result = await db.query.productCategories.findFirst({
			where: eq(productCategories.productId, productId),
			with: {
				category: {
					columns: { taxCode: true }
				}
			}
		});

		return result?.category?.taxCode ?? "standard";
	}
}

export const categoryService = new CategoryService();
