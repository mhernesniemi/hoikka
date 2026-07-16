/**
 * Seed demo catalog data into the local SQLite database.
 * Usage: pnpm seed (reads DATABASE_URL from the environment or .env)
 */
import { createNodeDb } from "../src/lib/server/db/node.js";
import { resolveDatabaseUrl } from "../src/lib/server/db/config.js";
import {
	products,
	productVariants,
	categories,
	productCategories
} from "../src/lib/server/db/schema.js";
import { reindexProduct } from "../src/lib/server/services/reindex.js";

const db = createNodeDb(resolveDatabaseUrl());

const existing = await db.select({ id: products.id }).from(products).limit(1);
if (existing.length > 0) {
	console.log("Database already contains products — skipping seed.");
	process.exit(0);
}

const DEMO_PRODUCTS = [
	{
		name: "Aurora Ceramic Mug",
		slug: "aurora-ceramic-mug",
		description:
			"A hand-glazed stoneware mug that keeps your coffee warm and your desk stylish.",
		variants: [
			{ sku: "MUG-AUR-BLU", name: "Blue", price: 2400, stock: 40 },
			{ sku: "MUG-AUR-SND", name: "Sand", price: 2400, stock: 25 }
		]
	},
	{
		name: "Fjord Wool Beanie",
		slug: "fjord-wool-beanie",
		description: "Merino wool beanie knitted for cold mornings and long walks.",
		variants: [
			{ sku: "BEA-FJO-GRY", name: "Grey", price: 3200, stock: 30 },
			{ sku: "BEA-FJO-RST", name: "Rust", price: 3200, stock: 18 }
		]
	},
	{
		name: "Studio Notebook A5",
		slug: "studio-notebook-a5",
		description: "Dot-grid notebook with lay-flat binding and 160 pages of heavyweight paper.",
		variants: [{ sku: "NTB-STU-A5", name: null, price: 1600, stock: 120 }]
	},
	{
		name: "Circuit Desk Lamp",
		slug: "circuit-desk-lamp",
		description: "Adjustable aluminium desk lamp with warm-to-cool dimming.",
		variants: [{ sku: "LMP-CIR-01", name: null, price: 8900, stock: 12 }]
	},
	{
		name: "Terra Plant Pot",
		slug: "terra-plant-pot",
		description: "Terracotta pot with a drainage tray, sized for herbs and small monsteras.",
		variants: [
			{ sku: "POT-TER-S", name: "Small", price: 1400, stock: 60 },
			{ sku: "POT-TER-L", name: "Large", price: 2200, stock: 35 }
		]
	},
	{
		name: "Drift Canvas Tote",
		slug: "drift-canvas-tote",
		description:
			"Heavy-duty canvas tote with an inner pocket. Carries groceries and laptops alike.",
		variants: [{ sku: "TOT-DRI-NAT", name: "Natural", price: 2800, stock: 50 }]
	}
];

const [category] = await db
	.insert(categories)
	.values({ name: "Everyday Goods", slug: "everyday-goods" })
	.returning();

for (const demo of DEMO_PRODUCTS) {
	const [product] = await db
		.insert(products)
		.values({ name: demo.name, slug: demo.slug, description: demo.description })
		.returning();

	await db.insert(productVariants).values(
		demo.variants.map((v) => ({
			productId: product.id,
			name: v.name,
			sku: v.sku,
			price: v.price,
			stock: v.stock
		}))
	);

	await db.insert(productCategories).values({ productId: product.id, categoryId: category.id });
	await reindexProduct(db, product.id);
}

console.log(`Seeded ${DEMO_PRODUCTS.length} products into "${resolveDatabaseUrl()}".`);
