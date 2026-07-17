/**
 * Tax Service
 * Handles VAT calculations for Finnish e-commerce.
 *
 * DB storage convention: tax rates are integer basis points with 4 decimal
 * digits of precision (0.24 → 2400). Conversion to/from decimals happens at
 * the DB boundary; all business logic below works with decimals.
 */
import { eq, and } from "drizzle-orm";
import { db } from "../db/index.js";
import { taxRates, customerGroupMembers, customerGroups } from "../db/schema.js";
import {
	calculateTax,
	calculateTaxExemptPrice,
	calculateLineTax,
	type TaxCalculation
} from "./tax-utils.js";

export type { TaxCalculation };

export interface TaxRateInfo {
	code: string;
	rate: number; // Decimal (0.24 for 24%)
	name: string;
}

const TAX_RATE_SCALE = 10_000;
export const taxRateFromDb = (n: number) => n / TAX_RATE_SCALE;
export const taxRateToDb = (n: number) => Math.round(n * TAX_RATE_SCALE);

// Default tax rates for Finland (standard 25.5% since 2024-09,
// reduced 13.5% since 2026-01; books moved from 10% to the reduced band in 2025)
const DEFAULT_TAX_RATES: TaxRateInfo[] = [
	{ code: "standard", rate: 0.255, name: "Standard VAT (25.5%)" },
	{ code: "food", rate: 0.135, name: "Food VAT (13.5%)" },
	{ code: "books", rate: 0.135, name: "Books VAT (13.5%)" },
	{ code: "zero", rate: 0, name: "Zero VAT (0%)" }
];

export class TaxService {
	async getTaxRate(taxCode: string): Promise<number> {
		const [rate] = await db.select().from(taxRates).where(eq(taxRates.code, taxCode));
		if (rate) return taxRateFromDb(rate.rate);
		return DEFAULT_TAX_RATES.find((r) => r.code === taxCode)?.rate ?? 0.255;
	}

	async getAllTaxRates(): Promise<TaxRateInfo[]> {
		const rates = await db.select().from(taxRates);
		if (rates.length > 0) {
			return rates.map((r) => ({
				code: r.code,
				rate: taxRateFromDb(r.rate),
				name: r.name
			}));
		}
		return DEFAULT_TAX_RATES;
	}

	calculateTax(grossPrice: number, taxRate: number): TaxCalculation {
		return calculateTax(grossPrice, taxRate);
	}

	calculateTaxExemptPrice(grossPrice: number, taxRate: number): number {
		return calculateTaxExemptPrice(grossPrice, taxRate);
	}

	calculateLineTax(
		grossUnitPrice: number,
		quantity: number,
		taxRate: number,
		isTaxExempt: boolean = false
	) {
		return calculateLineTax(grossUnitPrice, quantity, taxRate, isTaxExempt);
	}

	async isCustomerTaxExempt(customerId: number | null | undefined): Promise<boolean> {
		if (!customerId) return false;

		const [result] = await db
			.select({ id: customerGroups.id })
			.from(customerGroupMembers)
			.innerJoin(customerGroups, eq(customerGroupMembers.groupId, customerGroups.id))
			.where(
				and(
					eq(customerGroupMembers.customerId, customerId),
					eq(customerGroups.isTaxExempt, true)
				)
			)
			.limit(1);

		return !!result;
	}

	async seedDefaultRates(): Promise<void> {
		for (const rate of DEFAULT_TAX_RATES) {
			await db
				.insert(taxRates)
				.values({
					code: rate.code,
					rate: taxRateToDb(rate.rate),
					name: rate.name
				})
				.onConflictDoNothing();
		}
	}
}

export const taxService = new TaxService();
