/**
 * Customer Service
 * Handles customer management and addresses
 */
import { eq, and, asc, desc, isNull, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { customers, addresses } from "../db/schema.js";
import type {
	Customer,
	CustomerWithAddresses,
	Address,
	CreateCustomerInput,
	PaginatedResult
} from "$lib/types.js";

export class CustomerService {
	/**
	 * Create a new customer
	 */
	async create(input: CreateCustomerInput): Promise<Customer> {
		const [customer] = await db
			.insert(customers)
			.values({
				authUserId: input.authUserId,
				email: input.email,
				firstName: input.firstName,
				lastName: input.lastName,
				phone: input.phone
			})
			.returning();

		return customer;
	}

	/**
	 * Get customer by ID
	 */
	async getById(id: number): Promise<CustomerWithAddresses | null> {
		const [customer] = await db
			.select()
			.from(customers)
			.where(and(eq(customers.id, id), isNull(customers.deletedAt)));

		if (!customer) return null;

		const customerAddresses = await db
			.select()
			.from(addresses)
			.where(eq(addresses.customerId, id));

		return {
			...customer,
			addresses: customerAddresses
		};
	}

	/**
	 * Get customer by email
	 */
	async getByEmail(email: string): Promise<CustomerWithAddresses | null> {
		const [customer] = await db
			.select()
			.from(customers)
			.where(and(eq(customers.email, email), isNull(customers.deletedAt)));

		if (!customer) return null;

		return this.getById(customer.id);
	}

	/**
	 * List all customers
	 */
	async list(
		options: {
			limit?: number;
			offset?: number;
			search?: string;
			sortBy?: string;
			sortOrder?: "asc" | "desc";
		} = {}
	): Promise<PaginatedResult<Customer>> {
		const { limit = 20, offset = 0, search, sortBy, sortOrder = "desc" } = options;

		const conditions = [isNull(customers.deletedAt)];
		if (search) {
			const pattern = `%${search}%`;
			conditions.push(
				sql`(${customers.firstName} ILIKE ${pattern} OR ${customers.lastName} ILIKE ${pattern} OR ${customers.email} ILIKE ${pattern})` as any
			);
		}

		const countResult = await db
			.select({ count: sql<number>`count(*)` })
			.from(customers)
			.where(and(...conditions));
		const total = Number(countResult[0]?.count ?? 0);

		const sortColumnMap: Record<string, ReturnType<typeof sql>> = {
			name: sql`${customers.lastName}`,
			email: sql`${customers.email}`,
			phone: sql`${customers.phone}`,
			createdAt: sql`${customers.createdAt}`
		};
		const sortCol = (sortBy && sortColumnMap[sortBy]) || sql`${customers.createdAt}`;
		const dirFn = sortOrder === "asc" ? asc : desc;

		const items = await db
			.select()
			.from(customers)
			.where(and(...conditions))
			.orderBy(dirFn(sortCol))
			.limit(limit)
			.offset(offset);

		return {
			items,
			pagination: { total, limit, offset, hasMore: offset + items.length < total }
		};
	}

	/**
	 * Update customer
	 */
	async update(
		id: number,
		input: Partial<CreateCustomerInput> & { vatId?: string }
	): Promise<Customer | null> {
		const [customer] = await db.select().from(customers).where(eq(customers.id, id));

		if (!customer) return null;

		const [updated] = await db
			.update(customers)
			.set({
				...(input.email && { email: input.email }),
				...(input.firstName && { firstName: input.firstName }),
				...(input.lastName && { lastName: input.lastName }),
				...(input.phone !== undefined && { phone: input.phone }),
				...(input.vatId !== undefined && { vatId: input.vatId || null })
			})
			.where(eq(customers.id, id))
			.returning();

		return updated;
	}

	/**
	 * Soft delete customer
	 */
	async delete(id: number): Promise<boolean> {
		await db.update(customers).set({ deletedAt: new Date() }).where(eq(customers.id, id));

		return true;
	}

	// ============================================================================
	// ADDRESS METHODS
	// ============================================================================

	/**
	 * Add an address to a customer
	 */
	async addAddress(
		customerId: number,
		input: {
			fullName?: string;
			company?: string;
			streetLine1: string;
			streetLine2?: string;
			city: string;
			postalCode: string;
			country: string;
			phoneNumber?: string;
			isDefault?: boolean;
		}
	): Promise<Address> {
		// If this is the default address, unset other defaults
		if (input.isDefault) {
			await db
				.update(addresses)
				.set({ isDefault: false })
				.where(eq(addresses.customerId, customerId));
		}

		const [address] = await db
			.insert(addresses)
			.values({
				customerId,
				fullName: input.fullName,
				company: input.company,
				streetLine1: input.streetLine1,
				streetLine2: input.streetLine2,
				city: input.city,
				postalCode: input.postalCode,
				country: input.country,
				phoneNumber: input.phoneNumber,
				isDefault: input.isDefault ?? false
			})
			.returning();

		return address;
	}

	/**
	 * Update an address
	 */
	async updateAddress(
		addressId: number,
		input: Partial<{
			fullName: string;
			company: string;
			streetLine1: string;
			streetLine2: string;
			city: string;
			postalCode: string;
			country: string;
			phoneNumber: string;
			isDefault: boolean;
		}>
	): Promise<Address | null> {
		const [address] = await db.select().from(addresses).where(eq(addresses.id, addressId));

		if (!address) return null;

		// If setting as default, unset other defaults
		if (input.isDefault) {
			await db
				.update(addresses)
				.set({ isDefault: false })
				.where(eq(addresses.customerId, address.customerId));
		}

		const [updated] = await db
			.update(addresses)
			.set({
				...input
			})
			.where(eq(addresses.id, addressId))
			.returning();

		return updated;
	}

	/**
	 * Delete an address
	 */
	async deleteAddress(addressId: number): Promise<boolean> {
		await db.delete(addresses).where(eq(addresses.id, addressId));
		return true;
	}

	/**
	 * Get default address for a customer
	 */
	async getDefaultAddress(customerId: number): Promise<Address | null> {
		const [address] = await db
			.select()
			.from(addresses)
			.where(and(eq(addresses.customerId, customerId), eq(addresses.isDefault, true)));

		return address ?? null;
	}
}

// Export singleton instance
export const customerService = new CustomerService();
