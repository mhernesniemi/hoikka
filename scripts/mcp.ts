/**
 * Hoikka dev MCP server (stdio).
 *
 * Exposes the store's data model and common admin operations as MCP tools so
 * an AI assistant can inspect the schema, browse the catalog, create products
 * (and reindex search in the same step — the workflow that's otherwise easy to
 * forget), and manage inventory while developing a store.
 *
 * Runs standalone via `pnpm mcp` — it talks to the local SQLite database
 * directly (createNodeDb), so it needs no running dev server. Node target only;
 * point it at your database with DATABASE_URL if you're not using the default.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { eq, and, isNull, desc, like, getTableColumns } from "drizzle-orm";
import { createNodeDb } from "@hoikka/core/server/db/node";
import { resolveDatabaseUrl } from "@hoikka/core/server/db/config";
import * as schema from "@hoikka/core/server/db/schema";
import { reindexProduct, reindexAll } from "@hoikka/core/server/services/reindex";

const db = createNodeDb(resolveDatabaseUrl());

const server = new McpServer({ name: "hoikka", version: "0.1.0" });

const ok = (value: unknown) => ({
	structuredContent: { result: value },
	content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }]
});

// ── Schema inspection ───────────────────────────────────────────────────────

server.registerTool(
	"hoikka_describe_schema",
	{
		title: "Describe schema",
		description:
			"List all database tables and their columns (name, SQL type, notNull, hasDefault). The single source of truth for the store's data model.",
		inputSchema: {}
	},
	async () => {
		const tables: Record<string, unknown> = {};
		for (const [name, table] of Object.entries(schema)) {
			// Only drizzle table objects have getTableColumns-compatible shape
			try {
				const cols = getTableColumns(table as never);
				tables[name] = Object.fromEntries(
					Object.entries(cols).map(([col, def]) => [
						col,
						{
							type: (def as { dataType?: string }).dataType,
							notNull: (def as { notNull?: boolean }).notNull ?? false,
							hasDefault: (def as { hasDefault?: boolean }).hasDefault ?? false
						}
					])
				);
			} catch {
				// not a table (helper, relation, etc.) — skip
			}
		}
		return ok(tables);
	}
);

// ── Catalog ─────────────────────────────────────────────────────────────────

server.registerTool(
	"hoikka_list_products",
	{
		title: "List products",
		description: "List products (newest first) with their variants. Optional name/SKU search.",
		inputSchema: {
			search: z.string().optional(),
			limit: z.number().int().min(1).max(100).default(20)
		}
	},
	async ({ search, limit }) => {
		const rows = await db
			.select()
			.from(schema.products)
			.where(
				and(
					isNull(schema.products.deletedAt),
					search ? like(schema.products.name, `%${search}%`) : undefined
				)
			)
			.orderBy(desc(schema.products.id))
			.limit(limit);

		const withVariants = await Promise.all(
			rows.map(async (p) => ({
				...p,
				variants: await db
					.select()
					.from(schema.productVariants)
					.where(
						and(
							eq(schema.productVariants.productId, p.id),
							isNull(schema.productVariants.deletedAt)
						)
					)
			}))
		);
		return ok(withVariants);
	}
);

server.registerTool(
	"hoikka_create_product",
	{
		title: "Create product",
		description:
			"Create a product with one or more variants and add it to the FTS search index. Prices are in cents.",
		inputSchema: {
			name: z.string().min(1),
			slug: z.string().min(1),
			description: z.string().optional(),
			type: z.enum(["physical", "digital"]).default("physical"),
			variants: z
				.array(
					z.object({
						sku: z.string().min(1),
						name: z.string().optional(),
						price: z.number().int().min(0),
						stock: z.number().int().min(0).default(0)
					})
				)
				.min(1)
		}
	},
	async ({ name, slug, description, type, variants }) => {
		const [product] = await db
			.insert(schema.products)
			.values({ name, slug, description, type })
			.returning();

		await db.insert(schema.productVariants).values(
			variants.map((v) => ({
				productId: product.id,
				sku: v.sku,
				name: v.name ?? null,
				price: v.price,
				stock: v.stock
			}))
		);

		await reindexProduct(db, product.id);
		return ok({ id: product.id, slug: product.slug, variantCount: variants.length });
	}
);

server.registerTool(
	"hoikka_set_stock",
	{
		title: "Set variant stock",
		description:
			"Set a variant's stock level by SKU. Reindexes the product so search stays fresh.",
		inputSchema: { sku: z.string().min(1), stock: z.number().int().min(0) }
	},
	async ({ sku, stock }) => {
		const [variant] = await db
			.update(schema.productVariants)
			.set({ stock })
			.where(eq(schema.productVariants.sku, sku))
			.returning();
		if (!variant) throw new Error(`No variant with SKU "${sku}"`);
		await reindexProduct(db, variant.productId);
		return ok({ sku, stock, productId: variant.productId });
	}
);

// ── Operations ──────────────────────────────────────────────────────────────

server.registerTool(
	"hoikka_reindex",
	{
		title: "Reindex search",
		description: "Rebuild the entire FTS5 product search index. Use after bulk data changes.",
		inputSchema: {}
	},
	async () => ok({ reindexed: await reindexAll(db) })
);

server.registerTool(
	"hoikka_list_orders",
	{
		title: "List orders",
		description:
			"List recent placed orders (most recent first) with code, state, and total (cents).",
		inputSchema: { limit: z.number().int().min(1).max(100).default(20) }
	},
	async ({ limit }) => {
		const rows = await db
			.select({
				code: schema.orders.code,
				state: schema.orders.state,
				total: schema.orders.total,
				customerEmail: schema.orders.customerEmail,
				orderPlacedAt: schema.orders.orderPlacedAt
			})
			.from(schema.orders)
			.where(eq(schema.orders.active, false))
			.orderBy(desc(schema.orders.orderPlacedAt))
			.limit(limit);
		return ok(rows);
	}
);

await server.connect(new StdioServerTransport());
console.error("[hoikka:mcp] local MCP server started");
