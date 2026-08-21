/**
 * Pure tax calculation functions
 * No database or environment dependencies
 */

export interface TaxCalculation {
	gross: number;
	net: number;
	tax: number;
}

/**
 * Calculate tax breakdown from a gross price
 */
export function calculateTax(grossPrice: number, taxRate: number): TaxCalculation {
	if (taxRate === 0) {
		return { gross: grossPrice, net: grossPrice, tax: 0 };
	}

	const divisor = 1 + taxRate;
	const net = Math.round(grossPrice / divisor);
	const tax = grossPrice - net;

	return { gross: grossPrice, net, tax };
}

/**
 * Calculate tax-exempt price (net price)
 */
export function calculateTaxExemptPrice(grossPrice: number, taxRate: number): number {
	if (taxRate === 0) {
		return grossPrice;
	}
	return Math.round(grossPrice / (1 + taxRate));
}

/**
 * Calculate tax for a line item
 */
export function calculateLineTax(
	grossUnitPrice: number,
	quantity: number,
	taxRate: number,
	isTaxExempt: boolean = false
): {
	unitPriceGross: number;
	unitPriceNet: number;
	lineTotalGross: number;
	lineTotalNet: number;
	taxAmount: number;
} {
	if (isTaxExempt || taxRate === 0) {
		const netPrice = calculateTaxExemptPrice(grossUnitPrice, taxRate);
		const lineTotal = netPrice * quantity;
		return {
			unitPriceGross: grossUnitPrice,
			unitPriceNet: netPrice,
			lineTotalGross: lineTotal,
			lineTotalNet: lineTotal,
			taxAmount: 0
		};
	}

	const unitTax = calculateTax(grossUnitPrice, taxRate);
	const lineTotalGross = grossUnitPrice * quantity;
	const lineTotalNet = unitTax.net * quantity;
	const taxAmount = lineTotalGross - lineTotalNet;

	return {
		unitPriceGross: grossUnitPrice,
		unitPriceNet: unitTax.net,
		lineTotalGross,
		lineTotalNet,
		taxAmount
	};
}
