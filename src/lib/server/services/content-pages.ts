/**
 * Content Page Service
 * Simple CMS pages (About, FAQ, Terms, etc.)
 */
import { eq, and, desc, sql, type SQL } from "drizzle-orm";
import { db } from "../db/index.js";
import { paginationOf, resolveSort } from "../pagination.js";
import { contentPages } from "../db/schema.js";
import type { ContentPage, PaginatedResult } from "$lib/types.js";

export class ContentPageService {
	async list(): Promise<ContentPage[]> {
		return db.query.contentPages.findMany({
			orderBy: [desc(contentPages.createdAt)]
		});
	}

	/**
	 * List content pages with server-side pagination for admin list view.
	 */
	async listPaginated(
		options: {
			limit?: number;
			offset?: number;
			search?: string;
			sortBy?: string;
			sortOrder?: "asc" | "desc";
		} = {}
	): Promise<PaginatedResult<ContentPage>> {
		const { limit = 20, offset = 0, search, sortBy, sortOrder = "desc" } = options;

		const conditions: SQL[] = [];
		if (search) {
			const pattern = `%${search}%`;
			conditions.push(
				sql`(${contentPages.title} LIKE ${pattern} OR ${contentPages.slug} LIKE ${pattern})`
			);
		}

		const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

		const [countResult] = await db
			.select({ count: sql<number>`count(*)` })
			.from(contentPages)
			.where(whereClause);
		const total = Number(countResult?.count ?? 0);

		const orderByExpr = resolveSort(
			{
				title: sql`${contentPages.title}`,
				slug: sql`${contentPages.slug}`,
				published: sql`${contentPages.published}`,
				createdAt: sql`${contentPages.createdAt}`
			},
			sortBy,
			sortOrder,
			sql`${contentPages.createdAt}`
		);

		const items = await db
			.select()
			.from(contentPages)
			.where(whereClause)
			.orderBy(orderByExpr)
			.limit(limit)
			.offset(offset);

		return {
			items,
			pagination: paginationOf(total, limit, offset, items.length)
		};
	}

	async getById(id: number): Promise<ContentPage | null> {
		const page = await db.query.contentPages.findFirst({
			where: eq(contentPages.id, id)
		});
		return page ?? null;
	}

	async getPublishedById(id: number): Promise<ContentPage | null> {
		const page = await db.query.contentPages.findFirst({
			where: and(eq(contentPages.id, id), eq(contentPages.published, true))
		});
		return page ?? null;
	}

	async create(input: {
		title: string;
		slug: string;
		body?: string;
		imageUrl?: string | null;
		published?: boolean;
	}): Promise<ContentPage> {
		const [page] = await db
			.insert(contentPages)
			.values({
				title: input.title,
				slug: input.slug,
				body: input.body ?? null,
				imageUrl: input.imageUrl ?? null,
				published: input.published ?? false
			})
			.returning();

		return page;
	}

	async update(
		id: number,
		input: {
			title?: string;
			slug?: string;
			body?: string;
			imageUrl?: string | null;
			published?: boolean;
			template?: string;
			customFields?: Record<string, unknown>;
		}
	): Promise<ContentPage | null> {
		const existing = await this.getById(id);
		if (!existing) return null;

		const updateData: Record<string, unknown> = {};
		if (input.published !== undefined) updateData.published = input.published;
		if (input.title !== undefined) updateData.title = input.title;
		if (input.slug !== undefined) updateData.slug = input.slug;
		if (input.body !== undefined) updateData.body = input.body;
		if (input.imageUrl !== undefined) updateData.imageUrl = input.imageUrl;
		if (input.template !== undefined) updateData.template = input.template;
		if (input.customFields !== undefined) {
			updateData.customFields = { ...existing.customFields, ...input.customFields };
		}

		if (Object.keys(updateData).length > 0) {
			await db.update(contentPages).set(updateData).where(eq(contentPages.id, id));
		}

		return this.getById(id);
	}

	async delete(id: number): Promise<void> {
		await db.delete(contentPages).where(eq(contentPages.id, id));
	}
}

export const contentPageService = new ContentPageService();
