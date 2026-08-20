/**
 * CSV export of the last six months of completed orders, one row per order
 * line. UTF-8 with BOM so spreadsheet apps detect the encoding.
 */
import { error } from "@sveltejs/kit";
import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { db } from "$lib/server/db/index.js";
import { orders, orderLines } from "$lib/server/db/schema.js";
import { csvCell } from "$lib/server/csv.js";
import type { RequestHandler } from "./$types";

const EXPORT_MONTHS = 6;

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user || !["admin", "staff"].includes(locals.user.role ?? "")) {
		throw error(401, "Unauthorized");
	}

	const since = new Date();
	since.setMonth(since.getMonth() - EXPORT_MONTHS);

	const rows = await db
		.select({ order: orders, line: orderLines })
		.from(orders)
		.innerJoin(orderLines, eq(orderLines.orderId, orders.id))
		.where(
			and(
				inArray(orders.state, ["paid", "shipped", "delivered"]),
				gte(orders.orderPlacedAt, since)
			)
		)
		.orderBy(desc(orders.orderPlacedAt));

	const header = [
		"Order",
		"Date",
		"Status",
		"Customer",
		"Email",
		"Product",
		"Variant",
		"SKU",
		"Quantity",
		"Unit price",
		"Line total",
		"VAT %"
	];

	const body = rows.map(({ order, line }) =>
		[
			order.code,
			order.orderPlacedAt ? order.orderPlacedAt.toISOString().slice(0, 10) : "",
			order.state,
			order.shippingFullName ?? "",
			order.customerEmail ?? "",
			line.productName,
			line.variantName ?? "",
			line.sku,
			line.quantity,
			(line.unitPrice / 100).toFixed(2),
			(line.lineTotal / 100).toFixed(2),
			(line.taxRate / 100).toFixed(1)
		]
			.map(csvCell)
			.join(",")
	);

	const csv = "﻿" + [header.join(","), ...body].join("\r\n");

	return new Response(csv, {
		headers: {
			"content-type": "text/csv; charset=utf-8",
			"content-disposition": `attachment; filename="orders-${new Date().toISOString().slice(0, 10)}.csv"`
		}
	});
};
