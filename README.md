# Hoikka

[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE) [![Svelte](https://img.shields.io/badge/Svelte-5-ff3e00.svg)](https://svelte.dev) [![Drizzle](https://img.shields.io/badge/Drizzle-ORM-c5f74f.svg)](https://orm.drizzle.team) [![SQLite](https://img.shields.io/badge/SQLite-database-003b57.svg)](https://sqlite.org) [![Cloudflare](https://img.shields.io/badge/Cloudflare-ready-f38020.svg)](https://workers.cloudflare.com)

![Hoikka](static/hoikka-screenshot.jpg)

[Hoikka](https://hoikka.dev) is a full-stack SvelteKit ecommerce platform.

It includes the storefront, admin panel, and business logic in a single codebase running on SQLite. One switch deploys it to a plain Node.js server or to Cloudflare Workers (D1 + R2).

There are no plugin systems, configuration DSLs, or hidden admin logic. Everything is plain TypeScript that you read, change, and extend directly, in the spirit of the [Rails Doctrine](https://rubyonrails.org/doctrine). This also makes the codebase easy for both humans and AI agents to reason about.

## Quick Start

```bash
pnpx create-hoikka-app my-store
```

The CLI clones the latest release and asks two questions:

**How do you want the core?**

- **Package** — the managed core (admin, services, database, migrations) installs as an `@hoikka/core` dependency. Your project holds only what you customize: the storefront, `hoikka.config.ts`, and thin wiring. Upgrading is a version bump.
- **Embedded** — the full core source lives in `src/hoikka/`, yours to modify. Upgrades arrive by merging from the template.

**Where will you run the store?**

- **Local / Node.js** — SQLite file + local uploads. Optionally seeds demo products and starts `pnpm dev`.
- **Cloudflare** — Workers + D1 + R2. The CLI creates the resources, applies migrations, and deploys.

Switching targets later is one line: flip `HOIKKA_TARGET` in `.env`. Switching modes goes one way: `pnpm exec hoikka eject` copies the installed core into `src/hoikka/` and turns a package-mode project into an embedded one — there is no undo beyond git.

Both modes run identical source; the config file drives both. `hoikka.config.ts` defines store settings (currency, tax rates, countries, payment and shipping providers, limits) and the content model — custom fields on product types, content-page templates, and collections — validated at startup and fully typed in your storefront code.

One deliberate package-mode limitation: core database migrations ship with `@hoikka/core`, so you can't author your own there. Custom data goes through the config-defined custom fields; if you need schema ownership, eject.

## Features

- [Products & Variants](https://hoikka-docs.vercel.app/features/products): multiple variants per product with independent pricing, inventory, and images
- [Full-Text Search](https://hoikka-docs.vercel.app/features/search-and-categories): client-side product cache with instant filtering, faceted search, and pagination
- [Smart Collections](https://hoikka-docs.vercel.app/features/collections): rule-based product grouping by facets, price, stock, or manual selection
- [Categories](https://hoikka-docs.vercel.app/features/search-and-categories): hierarchical category tree with breadcrumb navigation
- [Promotions](https://hoikka-docs.vercel.app/features/promotions): percentage and fixed discounts, coupon codes, automatic promotions, per-group and per-product targeting
- [B2B Pricing](https://hoikka-docs.vercel.app/features/b2b): customer groups with group-specific variant prices and tax exemptions
- [Inventory](https://hoikka-docs.vercel.app/features/orders): stock tracking with timed reservations to prevent overselling
- [Orders & Checkout](https://hoikka-docs.vercel.app/features/orders): full checkout flow with guest and registered customer support
- [Payments](https://hoikka-docs.vercel.app/features/payments): pluggable payment methods (Stripe ready)
- [Shipping](https://hoikka-docs.vercel.app/features/shipping): configurable shipping methods with tracking
- [Tax](https://hoikka-docs.vercel.app/features/tax): VAT calculation with per-category rates and B2B exemptions
- [Wishlists](https://hoikka-docs.vercel.app/features/wishlists): for both logged-in and guest users
- [Reviews](https://hoikka-docs.vercel.app/features/reviews): customer ratings with moderation and verified purchase badges
- [Content Pages](https://hoikka-docs.vercel.app/features/content-pages): static pages for policies, FAQs, and more
- [Multi-Language](https://hoikka-docs.vercel.app/core/localization): translation tables for products, categories, collections, facets, and pages
- [Asset Management](https://hoikka-docs.vercel.app/features/assets): media library with focal point cropping

The shopping cart lives in a cookie — browsing and cart actions never write to the database, which keeps the storefront fast. An order is created only when checkout starts.

### Manual setup

```bash
git clone https://github.com/mhernesniemi/hoikka.git my-store
cd my-store
pnpm install

pnpm seed              # optional demo products
pnpm dev
```

The SQLite database is created at `./data/hoikka.db` automatically. For production, copy `.env.example` to `.env` and set `BETTER_AUTH_SECRET` (`openssl rand -base64 32`).

Migrations run automatically when the server starts. Create your admin account at `/admin` on first visit.

That auto-migration is the node target only. On the Cloudflare target the dev server talks to its own local D1, which nothing migrates on boot, so run `pnpm db:migrate:cf:local` once — `create-hoikka-app` does it for you — otherwise `pnpm dev` answers 500 on its first query. `pnpm db:migrate:cf` is the remote equivalent.

### AI assistant (MCP)

Hoikka ships a local [MCP](https://modelcontextprotocol.io) server (`pnpm mcp`) that lets an AI assistant inspect the schema, browse the catalog, create products (with search indexing handled for you), adjust stock, and read orders. It's registered in `.mcp.json`, so MCP-aware tools (e.g. Claude Code) discover it automatically — no setup beyond `pnpm install`.

Or follow the full [installation instructions](https://hoikka-docs.vercel.app/getting-started/installation).

## Docs

You can find the full documentation at [Hoikka Docs](https://hoikka-docs.vercel.app).
