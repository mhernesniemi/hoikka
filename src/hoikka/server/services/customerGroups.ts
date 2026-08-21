/**
 * Customer Groups Service
 * Handles B2B customer group management
 */
import { eq, desc, sql, and, like, count, type SQL } from "drizzle-orm";
import { db, atomic } from "../db/index.js";
import { paginationOf, resolveSort } from "../pagination.js";
import { customerGroups, customerGroupMembers, customers } from "../db/schema.js";
import type {
	CustomerGroup,
	CustomerGroupListItem,
	NewCustomerGroup,
	Customer,
	PaginatedResult
} from "@hoikka/core/shared/types";

import { slugify } from "@hoikka/core/shared/utils";

export class CustomerGroupService {
	/**
	 * Generate a unique code by appending a numeric suffix if needed
	 */
	private async generateUniqueCode(baseCode: string, excludeId?: number): Promise<string> {
		// Find all codes that start with the base code
		const existing = await db
			.select({ code: customerGroups.code, id: customerGroups.id })
			.from(customerGroups)
			.where(like(customerGroups.code, `${baseCode}%`));

		const existingCodes = new Set(
			existing.filter((g) => g.id !== excludeId).map((g) => g.code)
		);

		if (!existingCodes.has(baseCode)) {
			return baseCode;
		}

		// Find the next available suffix
		let suffix = 2;
		while (existingCodes.has(`${baseCode}-${suffix}`)) {
			suffix++;
		}

		return `${baseCode}-${suffix}`;
	}

	/**
	 * Create a new customer group
	 */
	async create(input: { name: string; description?: string }): Promise<CustomerGroup> {
		const baseCode = slugify(input.name);
		const code = await this.generateUniqueCode(baseCode);

		const [group] = await db
			.insert(customerGroups)
			.values({
				code,
				name: input.name,
				description: input.description
			})
			.returning();

		return group;
	}

	/**
	 * Get customer group by ID
	 */
	async getById(id: number): Promise<CustomerGroup | null> {
		const [group] = await db.select().from(customerGroups).where(eq(customerGroups.id, id));

		return group ?? null;
	}

	/**
	 * List all customer groups with customer counts
	 */
	async list(): Promise<(CustomerGroup & { customerCount: number })[]> {
		const groups = await db
			.select()
			.from(customerGroups)
			.orderBy(desc(customerGroups.createdAt));

		// Get customer counts for each group
		const groupsWithCounts = await Promise.all(
			groups.map(async (group) => {
				const countResult = await db
					.select({ count: sql<number>`count(*)` })
					.from(customerGroupMembers)
					.where(eq(customerGroupMembers.groupId, group.id));

				return {
					...group,
					customerCount: Number(countResult[0]?.count ?? 0)
				};
			})
		);

		return groupsWithCounts;
	}

	/**
	 * List customer groups with server-side pagination for admin list view.
	 */
	async listPaginated(
		options: {
			limit?: number;
			offset?: number;
			search?: string;
			sortBy?: string;
			sortOrder?: "asc" | "desc";
		} = {}
	): Promise<PaginatedResult<CustomerGroupListItem>> {
		const { limit = 20, offset = 0, search, sortBy, sortOrder = "desc" } = options;

		const conditions: SQL[] = [];
		if (search) {
			const pattern = `%${search}%`;
			conditions.push(
				sql`(${customerGroups.name} LIKE ${pattern} OR ${customerGroups.description} LIKE ${pattern})`
			);
		}

		const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

		const [countResult] = await db
			.select({ count: sql<number>`count(*)` })
			.from(customerGroups)
			.where(whereClause);
		const total = Number(countResult?.count ?? 0);

		const customerCountExpr = sql<number>`(${db
			.select({ value: count() })
			.from(customerGroupMembers)
			.where(eq(customerGroupMembers.groupId, customerGroups.id))})`;

		const orderByExpr = resolveSort(
			{
				name: sql`${customerGroups.name}`,
				description: sql`${customerGroups.description}`,
				customerCount: customerCountExpr,
				createdAt: sql`${customerGroups.createdAt}`
			},
			sortBy,
			sortOrder,
			sql`${customerGroups.createdAt}`
		);

		const items = await db
			.select({
				id: customerGroups.id,
				name: customerGroups.name,
				description: customerGroups.description,
				createdAt: customerGroups.createdAt,
				customerCount: customerCountExpr
			})
			.from(customerGroups)
			.where(whereClause)
			.orderBy(orderByExpr)
			.limit(limit)
			.offset(offset);

		return {
			items: items.map((item) => ({ ...item, customerCount: Number(item.customerCount) })),
			pagination: paginationOf(total, limit, offset, items.length)
		};
	}

	/**
	 * Update customer group
	 */
	async update(
		id: number,
		input: { name?: string; description?: string; isTaxExempt?: boolean }
	): Promise<CustomerGroup | null> {
		const [group] = await db.select().from(customerGroups).where(eq(customerGroups.id, id));

		if (!group) return null;

		const updateData: Partial<NewCustomerGroup> = {};
		if (input.name) {
			updateData.name = input.name;
			const baseCode = slugify(input.name);
			updateData.code = await this.generateUniqueCode(baseCode, id);
		}
		if (input.description !== undefined) {
			updateData.description = input.description;
		}
		if (input.isTaxExempt !== undefined) {
			updateData.isTaxExempt = input.isTaxExempt;
		}

		const [updated] = await db
			.update(customerGroups)
			.set(updateData)
			.where(eq(customerGroups.id, id))
			.returning();

		return updated;
	}

	/**
	 * Delete customer group
	 */
	async delete(id: number): Promise<boolean> {
		await db.delete(customerGroups).where(eq(customerGroups.id, id));
		return true;
	}

	/**
	 * Get customers in a group
	 */
	async getCustomers(groupId: number): Promise<Customer[]> {
		const result = await db
			.select({
				customer: customers
			})
			.from(customerGroupMembers)
			.innerJoin(customers, eq(customerGroupMembers.customerId, customers.id))
			.where(eq(customerGroupMembers.groupId, groupId))
			.orderBy(desc(customers.createdAt));

		return result.map((r) => r.customer);
	}

	/**
	 * Get groups for a customer
	 */
	async getGroupsForCustomer(customerId: number): Promise<CustomerGroup[]> {
		const result = await db
			.select({
				group: customerGroups
			})
			.from(customerGroupMembers)
			.innerJoin(customerGroups, eq(customerGroupMembers.groupId, customerGroups.id))
			.where(eq(customerGroupMembers.customerId, customerId));

		return result.map((r) => r.group);
	}

	/**
	 * Add customer to group
	 */
	async addCustomer(groupId: number, customerId: number): Promise<boolean> {
		await db.insert(customerGroupMembers).values({ groupId, customerId }).onConflictDoNothing();

		return true;
	}

	/**
	 * Remove customer from group
	 */
	async removeCustomer(groupId: number, customerId: number): Promise<boolean> {
		await db
			.delete(customerGroupMembers)
			.where(
				and(
					eq(customerGroupMembers.groupId, groupId),
					eq(customerGroupMembers.customerId, customerId)
				)
			);

		return true;
	}

	/**
	 * Set the full list of customers in a group (sync)
	 */
	async setCustomers(groupId: number, customerIds: number[]): Promise<void> {
		await atomic([
			db.delete(customerGroupMembers).where(eq(customerGroupMembers.groupId, groupId)),
			...(customerIds.length > 0
				? [
						db
							.insert(customerGroupMembers)
							.values(customerIds.map((customerId) => ({ groupId, customerId })))
							.onConflictDoNothing()
					]
				: [])
		]);
	}

	/**
	 * Check if customer is in group
	 */
	async isCustomerInGroup(groupId: number, customerId: number): Promise<boolean> {
		const [membership] = await db
			.select()
			.from(customerGroupMembers)
			.where(
				and(
					eq(customerGroupMembers.groupId, groupId),
					eq(customerGroupMembers.customerId, customerId)
				)
			);

		return !!membership;
	}
}

// Export singleton instance
export const customerGroupService = new CustomerGroupService();
