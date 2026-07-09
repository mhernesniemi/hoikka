# Cloudflare Migration Plan

Migrate Hoikka from Vercel + Neon PostgreSQL to Cloudflare Workers + D1 + KV + Durable Objects + R2.

## Current Stack → Target Stack

| Layer | Current | Target |
|-------|---------|--------|
| Runtime | Vercel Functions (fra1) | Cloudflare Workers (edge) |
| Adapter | `@sveltejs/adapter-vercel` | `@sveltejs/adapter-cloudflare` |
| Database | Neon PostgreSQL | Cloudflare D1 (SQLite) |
| Auth | Neon Auth (OAuth) | Better Auth |
| File Storage | Vercel Blob | Cloudflare R2 |
| Cart/Session | PostgreSQL (active orders) | Durable Objects |
| Cache | None | Cloudflare KV |
| Search | PostgreSQL tsvector | SQLite FTS5 |
| Background Jobs | Vercel Workflows | Cron Triggers + Queues |
| Observability | `@vercel/otel` + `@vercel/analytics` | Cloudflare Workers Analytics / Logpush |
| Email | Resend | Resend (no change) |
| Payments | Stripe | Stripe (no change) |

---

## Architecture Overview

```
Cloudflare Workers (SvelteKit adapter-cloudflare)
│
├── D1 (SQLite)
│   └── System of record: products, orders (committed), customers,
│       categories, collections, facets, promotions, reviews,
│       content pages, tax rates, shipping/payment methods
│
├── Durable Objects
│   ├── CartSession — cart state, stock reservations, wishlist
│   │   (per guest-token or customer-id, flushed to D1 on checkout)
│   └── StockCoordinator — per-variant, manages reservation counts
│       (ensures no overselling across concurrent carts)
│
├── KV
│   ├── Session tokens (Better Auth sessions)
│   ├── Product listing cache (invalidated on admin writes)
│   ├── Category/collection tree cache
│   ├── Translation cache
│   └── Storefront config cache
│
├── R2
│   └── Product images, asset uploads
│
├── Queues
│   ├── order-processing — post-checkout: email, digital delivery
│   └── reindex — search index rebuild jobs
│
└── Cron Triggers
    └── Periodic cleanup (orphaned DOs, expired sessions)
```

---

## Phase 1: Foundation — Auth + Database Schema

This phase sets up the two hardest pieces first so everything else can build on top.

### 1.1 Better Auth Setup

**Replace:** Neon Auth (`neon_auth` schema, OAuth proxy at `/api/auth/[...path]`)
**With:** Better Auth (https://www.better-auth.com)

**Tasks:**
- [ ] Install `better-auth` and `@better-auth/d1` adapter
- [ ] Configure Better Auth with D1 adapter and email+password + social (Google) providers
- [ ] Better Auth provides its own tables (`user`, `session`, `account`, `verification`). Let it manage these via its D1 adapter
- [ ] Create auth route handler at `/api/auth/[...all]` using Better Auth's SvelteKit integration
- [ ] Rewrite `hooks.server.ts` session handling:
  - Remove `oauthVerifierHandler` (Neon Auth verifier exchange)
  - Remove `sessionHandler` that calls Neon Auth `/get-session`
  - Replace with Better Auth session validation via `auth.api.getSession()`
  - Keep setting `event.locals.user` and `event.locals.customer` with same shape
- [ ] Rewrite admin auth:
  - Admin setup page: create admin user via Better Auth API instead of Neon Auth sign-up endpoint
  - Admin role: use Better Auth's user metadata or a custom `role` field
  - Admin route protection: same pattern, different session source
- [ ] Rewrite customer sync logic:
  - On session validation, look up customer by `authUserId` (Better Auth user ID)
  - Create customer record if not found (same pattern as current)
- [ ] Rewrite sign-in/sign-up pages to use Better Auth client
- [ ] Remove Neon Auth dependencies: `@neondatabase/neon-js`, auth proxy route, `NEON_AUTH_BASE_URL` env var

**Auth-related files to modify:**
- `src/hooks.server.ts` — session validation, customer sync
- `src/routes/api/auth/[...path]/+server.ts` — replace with Better Auth handler
- `src/routes/(storefront)/sign-in/` — sign-in page
- `src/routes/(storefront)/sign-up/` — sign-up page
- `src/routes/admin/login/` — admin login
- `src/routes/admin/setup/` — first admin creation
- `src/routes/(storefront)/account/` — account pages (session checks)
- `src/lib/server/db/schema.ts` — remove neon_auth references

### 1.2 Database Schema Migration (PostgreSQL → SQLite/D1)

**Replace:** Drizzle PostgreSQL schema + Neon HTTP driver
**With:** Drizzle SQLite schema + D1 driver

**Tasks:**
- [ ] Change `drizzle.config.ts`: `dialect: "sqlite"`, D1 credentials
- [ ] Rewrite `src/lib/server/db/index.ts`: use `drizzle-orm/d1` driver, get D1 binding from platform env
- [ ] Rewrite `src/lib/server/db/schema.ts` — full rewrite required:

  **Type mappings:**
  | PostgreSQL | SQLite/Drizzle |
  |-----------|----------------|
  | `serial("id").primaryKey()` | `integer("id").primaryKey({ autoIncrement: true })` |
  | `varchar(n)` | `text("name")` |
  | `text` | `text` |
  | `boolean` | `integer({ mode: "boolean" })` |
  | `integer` | `integer` |
  | `numeric(p, s)` | `integer` (store cents/basis points) or `real` |
  | `timestamp` | `integer({ mode: "timestamp" })` or `text` (ISO 8601) |
  | `jsonb` | `text({ mode: "json" })` |
  | `tsvector` (custom) | Remove (replaced by FTS5 virtual table) |

  **Specific changes:**
  - Remove `tsvector` custom type entirely
  - Convert all `timestamp` columns to `integer` (unix epoch) or `text` (ISO)
  - Convert `numeric` columns (taxRate, focalX/Y, exchangeRate) to `integer` (basis points: 24% = 2400) or `real` where exact precision isn't critical (focal points)
  - Convert `jsonb` columns to `text({ mode: "json" })`
  - Remove GIN indexes (searchVector, facets)
  - Verify all foreign key cascades work in SQLite (they do, with `PRAGMA foreign_keys = ON`)
  - Update all 37 foreign key relationships — same syntax in Drizzle SQLite

- [ ] Remove `productSearch` table from main schema (replaced by FTS5 virtual table, see Phase 2)
- [ ] Generate initial D1 migration: `bun run db:generate`
- [ ] Update build script to run D1 migrations
- [ ] Remove old PostgreSQL migrations from `drizzle/` directory

**Schema file is ~1150 lines with 36 tables. Expect the rewrite to touch every table definition but the relational structure stays the same.**

### 1.3 Service Layer Updates

Every service file that imports from the schema or uses PostgreSQL-specific SQL needs updating.

**Tasks:**
- [ ] Update all service imports from `drizzle-orm/pg-core` to `drizzle-orm/sqlite-core`
- [ ] Audit every `sql` template literal for PostgreSQL-specific syntax
- [ ] Update timestamp comparisons (if using integer timestamps, compare as numbers)
- [ ] Update JSON column queries — replace `jsonb_array_elements()`, `->>`, `jsonb_each()` with SQLite JSON functions (`json_extract()`, `json_each()`)
- [ ] Update the `db` import across all services to use D1-backed drizzle instance
- [ ] Pass D1 binding through SvelteKit's `platform.env` in hooks/load functions

**Files to audit (all in `src/lib/server/services/`):**
- `orders.ts` (1313 lines — largest, most complex)
- `products.ts`, `product.ts`
- `categories.ts`, `collections.ts`
- `facets.ts`
- `customers.ts`, `customerGroups.ts`
- `promotions.ts`, `promotion-utils.ts`
- `tax.ts`, `tax-utils.ts`
- `shipping/index.ts`, `shipping/providers/flat-rate.ts`
- `payments/index.ts`, `payments/providers/stripe.ts`
- `reviews.ts`
- `wishlist.ts`
- `content-pages.ts`
- `translations.ts`
- `assets.ts`
- `related-products.ts`
- `reservations.ts`
- `digitalDelivery.ts`

---

## Phase 2: Search — FTS5 Replacement

**Replace:** PostgreSQL tsvector + GIN index + `product_search` denormalized table
**With:** SQLite FTS5 virtual table

### 2.1 FTS5 Schema

**Tasks:**
- [ ] Create FTS5 virtual table for product search:
  ```sql
  CREATE VIRTUAL TABLE product_search_fts USING fts5(
    product_id UNINDEXED,
    name,
    description,
    sku UNINDEXED,
    facets UNINDEXED,
    featured_asset UNINDEXED,
    variant_facet_images UNINDEXED,
    min_price UNINDEXED,
    max_price UNINDEXED,
    in_stock UNINDEXED,
    enabled UNINDEXED,
    tokenize='unicode61'
  );
  ```
  Note: FTS5 UNINDEXED columns are stored but not searchable — use for filter/display data.
- [ ] FTS5 virtual tables can't be created via Drizzle migrations. Use a raw SQL migration or a setup script that runs `CREATE VIRTUAL TABLE IF NOT EXISTS`

### 2.2 Rewrite Search Service

**Replace:** `src/lib/server/services/product-search.ts`
**Currently uses:** `to_tsquery()`, `@@` operator, `jsonb_array_elements()`, GIN indexes

**Tasks:**
- [ ] Rewrite search queries to use FTS5 `MATCH` operator:
  ```sql
  SELECT * FROM product_search_fts WHERE product_search_fts MATCH 'search terms*'
  ```
  - Current prefix matching (`word:*`) maps to FTS5 prefix queries (`word*`)
  - FTS5 `rank` function replaces tsvector ranking
- [ ] Rewrite facet filtering:
  - Current: JSONB extraction with `jsonb_each()` and `jsonb_array_elements()`
  - New: Store facets as JSON text, use `json_each()` and `json_extract()` for filtering
  - Consider a separate `product_search_facets` table (productId, facetKey, facetValue) for efficient filtering if JSON queries are too slow
- [ ] Rewrite `getFilteredFacetCounts()`:
  - Current: Complex JSONB aggregation with lateral joins
  - New: Use `json_each()` or the separate facets table
- [ ] Keep the same public API for the search service (same input/output types)

### 2.3 Rewrite Reindex Service

**Replace:** `src/lib/server/services/reindex.ts`
**Currently uses:** `to_tsvector()`, upsert into `product_search` table

**Tasks:**
- [ ] Rewrite reindex to populate FTS5 table:
  - Delete existing rows for product
  - Insert new row with name, description, metadata
  - FTS5 handles tokenization automatically (no need for `to_tsvector`)
- [ ] Trigger reindex via Cloudflare Queue (instead of running inline on admin save)
- [ ] Keep `bun run reindex` script for full rebuild

---

## Phase 3: Durable Objects — Cart, Wishlist, Stock Reservations

This is the biggest architectural improvement. Move all in-flight session state out of D1 into Durable Objects.

### 3.1 CartSession Durable Object

**Replace:**
- Active orders in `orders` table (`active = true`)
- `order_lines` for cart items
- `stock_reservations` table
- `wishlist` / `wishlist_items` tables (for current session)
- Guest cart token cookie system
- Vercel Workflow for reservation cleanup

**Design:**

Each CartSession DO is identified by `guest:{cartToken}` or `customer:{customerId}`.

**State stored in DO (in-memory + storage API):**
```typescript
interface CartSessionState {
  // Cart
  lines: Array<{
    variantId: number;
    quantity: number;
    unitPrice: number;
    taxRate: number;
    productName: string;
    variantName: string;
    imageUrl?: string;
  }>;

  // Wishlist
  wishlistItems: Array<{
    productId: number;
    variantId?: number;
  }>;

  // Metadata
  customerId?: number;
  guestToken?: string;
  email?: string;
  shippingAddressId?: number;
  shippingMethodId?: number;
  promotionCodes: string[];
  lastActivity: number; // unix timestamp
}
```

**DO Methods (via fetch API):**
- `POST /add-line` — add item to cart, call StockCoordinator to reserve
- `POST /update-line` — update quantity, adjust reservation
- `POST /remove-line` — remove item, release reservation
- `POST /add-wishlist` — add to wishlist
- `POST /remove-wishlist` — remove from wishlist
- `GET /cart` — return current cart state with calculated totals
- `GET /wishlist` — return wishlist items
- `POST /set-shipping` — set shipping address + method
- `POST /apply-promotion` — apply promo code
- `POST /checkout` — flush to D1: create order + order_lines + deduct stock atomically
- `POST /transfer` — merge guest DO into customer DO (on login)

**Tasks:**
- [ ] Create `src/lib/server/durable-objects/cart-session.ts`
- [ ] Implement cart operations with DO storage API for durability
- [ ] Implement totals calculation in DO (reuse `calculateOrderTotals` logic from `order-utils.ts`)
- [ ] Implement checkout flush: single D1 transaction to write order + lines + deduct stock
- [ ] Implement guest-to-customer transfer: merge states, delete guest DO
- [ ] DO auto-hibernates after idle — no explicit cleanup needed for reservations
- [ ] Configure DO alarm for session expiry (e.g., 30 days idle → delete)

### 3.2 StockCoordinator Durable Object

**Purpose:** Prevent overselling. One DO per product variant, tracks total reserved quantity.

**Design:**
- ID: `variant:{variantId}`
- State: `{ totalStock: number, reserved: number }`
- Loaded from D1 on first access, cached in memory

**Methods:**
- `POST /reserve` — `{ quantity }` → success/fail (checks available = totalStock - reserved)
- `POST /release` — `{ quantity }` → decrements reserved
- `POST /commit` — `{ quantity }` → deducts from totalStock (on checkout), decrements reserved
- `POST /sync` — reload stock from D1 (after admin stock update)

**Tasks:**
- [ ] Create `src/lib/server/durable-objects/stock-coordinator.ts`
- [ ] Wire into CartSession: reserve on add, release on remove, commit on checkout
- [ ] Admin stock updates must call `/sync` on affected variant DOs
- [ ] Handle edge case: DO eviction → reload from D1 on next access

### 3.3 Update Cart Remote Functions

**Replace:** `src/lib/remote/cart.remote.ts` — currently calls `orderService` directly

**Tasks:**
- [ ] Rewrite `addToCart()`: get DO stub → call `/add-line`
- [ ] Rewrite `updateCartLineQuantity()`: get DO stub → call `/update-line`
- [ ] Rewrite `removeCartLine()`: get DO stub → call `/remove-line`
- [ ] Rewrite wishlist remote functions similarly
- [ ] Update cart/wishlist Svelte stores to work with new response shapes

### 3.4 Update Hooks

**Tasks:**
- [ ] `cartHandler`: simplify — just read cookie, no DB transfer (DO handles transfer)
- [ ] `wishlistHandler`: simplify — just read cookie
- [ ] On login: call CartSession DO `/transfer` to merge guest → customer
- [ ] Remove `shippingInit` / `paymentInit` one-time hooks (move to D1 seed or deploy script)

### 3.5 Update Checkout Flow

**Replace:** `src/routes/(storefront)/checkout/+page.server.ts`

**Tasks:**
- [ ] Checkout reads cart from DO instead of D1
- [ ] "Place order" calls DO `/checkout` which atomically:
  1. Validates stock via StockCoordinator
  2. Writes order + lines to D1
  3. Commits stock deductions via StockCoordinator
  4. Returns order ID
- [ ] Payment flow unchanged (Stripe still works on Workers with `nodejs_compat`)
- [ ] After successful payment, enqueue order-processing job (email, digital delivery)

### 3.6 Remove Old Cart/Reservation Infrastructure

**Tasks:**
- [ ] Remove `active` flag from `orders` table (orders are only created on checkout)
- [ ] Remove `cartToken` column from `orders` table
- [ ] Remove `stockReservations` table entirely
- [ ] Remove `src/lib/server/services/reservations.ts`
- [ ] Remove `workflows/cleanup.ts` (Vercel Workflow)
- [ ] Remove `workflow` package dependency
- [ ] Simplify `orders.ts` — remove `getOrCreateActiveCart`, `transferCartToCustomer`, cart-related methods

---

## Phase 4: File Storage — R2

**Replace:** Vercel Blob (`@vercel/blob`)
**With:** Cloudflare R2

### 4.1 R2 Setup

**Tasks:**
- [ ] Create R2 bucket via `wrangler r2 bucket create hoikka-assets`
- [ ] Add R2 binding in `wrangler.toml`
- [ ] Configure public access or signed URLs for serving images

### 4.2 Asset Service Migration

**Replace:** `src/lib/server/services/assets.ts` — currently uses `put()` from `@vercel/blob`

**Tasks:**
- [ ] Rewrite upload to use R2 `put()` via binding
- [ ] Rewrite delete to use R2 `delete()`
- [ ] Update URL generation — R2 public bucket URL or custom domain
- [ ] Update `src/routes/api/assets/upload/+server.ts`
- [ ] Remove `@vercel/blob` dependency
- [ ] Update image URL references in templates (Vercel Blob URLs → R2 URLs)
- [ ] Data migration: copy existing assets from Vercel Blob to R2 (one-time script)

---

## Phase 5: KV Cache Layer

Add caching for read-heavy, write-light data.

### 5.1 KV Setup

**Tasks:**
- [ ] Create KV namespace: `wrangler kv namespace create CACHE`
- [ ] Add KV binding in `wrangler.toml`

### 5.2 Cache Strategy

**What to cache in KV:**
- Product listings (paginated, by category/collection) — TTL: 5 min, invalidate on admin write
- Category tree — TTL: 1 hour, invalidate on admin category change
- Collection data — TTL: 5 min
- Translation strings — TTL: 1 hour
- Storefront settings — TTL: 1 hour
- Facet definitions — TTL: 1 hour

**What NOT to cache:**
- Cart data (in DO)
- Order data (real-time)
- Customer data (personal, real-time)
- Stock levels (managed by StockCoordinator DO)

### 5.3 Implementation

**Tasks:**
- [ ] Create `src/lib/server/cache.ts` — thin wrapper around KV with typed keys
- [ ] Add cache reads in storefront load functions (product pages, category pages, etc.)
- [ ] Add cache invalidation in admin actions (product save, category save, etc.)
- [ ] Pattern: `const data = await cache.get(key) ?? await fetchAndCache(key)`

---

## Phase 6: Background Jobs — Queues + Cron Triggers

**Replace:** Vercel Workflows
**With:** Cloudflare Queues + Cron Triggers

### 6.1 Queues

**Tasks:**
- [ ] Create queues: `order-processing`, `reindex`
- [ ] Add queue bindings in `wrangler.toml`
- [ ] Create queue consumer workers:
  - `order-processing`: send confirmation email, trigger digital delivery, update analytics
  - `reindex`: rebuild FTS5 index for specific products or full catalog
- [ ] Enqueue jobs from checkout flow and admin actions

### 6.2 Cron Triggers

**Tasks:**
- [ ] Configure in `wrangler.toml`:
  ```toml
  [triggers]
  crons = ["*/15 * * * *"]  # every 15 min
  ```
- [ ] Implement scheduled handler for:
  - Clean up expired/orphaned DO sessions (optional, DOs auto-hibernate)
  - Any periodic maintenance tasks

---

## Phase 7: Deployment + Configuration

### 7.1 SvelteKit Adapter

**Tasks:**
- [ ] Install `@sveltejs/adapter-cloudflare`
- [ ] Update `svelte.config.js`:
  ```js
  import adapter from '@sveltejs/adapter-cloudflare';
  export default { kit: { adapter: adapter() } };
  ```
- [ ] Remove `@sveltejs/adapter-vercel`

### 7.2 Wrangler Configuration

**Tasks:**
- [ ] Create `wrangler.toml`:
  ```toml
  name = "hoikka"
  compatibility_date = "2024-12-01"
  compatibility_flags = ["nodejs_compat"]

  [vars]
  PUBLIC_STRIPE_PUBLISHABLE_KEY = "..."

  [[d1_databases]]
  binding = "DB"
  database_name = "hoikka"
  database_id = "..."

  [[r2_buckets]]
  binding = "ASSETS"
  bucket_name = "hoikka-assets"

  [[kv_namespaces]]
  binding = "CACHE"
  id = "..."

  [[durable_objects.bindings]]
  name = "CART_SESSION"
  class_name = "CartSession"

  [[durable_objects.bindings]]
  name = "STOCK_COORDINATOR"
  class_name = "StockCoordinator"

  [[queues.producers]]
  binding = "ORDER_QUEUE"
  queue = "order-processing"

  [[queues.producers]]
  binding = "REINDEX_QUEUE"
  queue = "reindex"

  [[queues.consumers]]
  queue = "order-processing"

  [[queues.consumers]]
  queue = "reindex"
  ```

### 7.3 Environment & Secrets

**Tasks:**
- [ ] Set secrets via `wrangler secret put`:
  - `STRIPE_SECRET_KEY`
  - `RESEND_API_KEY`
  - `RESEND_FROM_EMAIL`
  - `BETTER_AUTH_SECRET`
- [ ] Update `src/app.d.ts` with Cloudflare platform types:
  ```typescript
  interface Platform {
    env: {
      DB: D1Database;
      ASSETS: R2Bucket;
      CACHE: KVNamespace;
      CART_SESSION: DurableObjectNamespace;
      STOCK_COORDINATOR: DurableObjectNamespace;
      ORDER_QUEUE: Queue;
      REINDEX_QUEUE: Queue;
    };
  }
  ```

### 7.4 Remove Vercel Dependencies

**Tasks:**
- [ ] Remove packages: `@sveltejs/adapter-vercel`, `@vercel/blob`, `@vercel/analytics`, `@vercel/speed-insights`, `@vercel/otel`, `workflow`
- [ ] Remove `vercel.json`
- [ ] Remove `workflows/` directory
- [ ] Remove Vercel-specific environment checks (`!!env.VERCEL`)
- [ ] Update security headers (move from `vercel.json` to Worker response headers or `_headers` file)

---

## Phase 8: Data Migration

One-time migration of production data from PostgreSQL to D1.

### 8.1 Database Data

**Tasks:**
- [ ] Write migration script that:
  1. Reads all tables from Neon PostgreSQL
  2. Transforms data (timestamps → integers, numeric → integers, jsonb → json text)
  3. Inserts into D1 in dependency order (respecting foreign keys)
  4. Rebuilds FTS5 search index
- [ ] Test with production data dump locally
- [ ] Plan cutover window (stop writes → migrate → switch DNS)

### 8.2 Asset Migration

**Tasks:**
- [ ] Script to list all Vercel Blob assets and copy to R2
- [ ] Update asset URLs in database (or use URL rewrite at edge)

### 8.3 Auth Migration

**Tasks:**
- [ ] Export existing users from Neon Auth
- [ ] Import into Better Auth (D1) — preserve user IDs or update `customers.authUserId` references
- [ ] Users may need to reset passwords (depends on Neon Auth export capabilities)
- [ ] Communicate to users if re-authentication is needed

---

## Execution Order

Phases can partially overlap. Recommended order:

```
Phase 1 (Auth + Schema)     ████████████░░░░░░░░░░░░░░░░░░░░
Phase 2 (Search)                     ████████░░░░░░░░░░░░░░░░
Phase 3 (Durable Objects)               ████████████░░░░░░░░░░
Phase 4 (R2)                                 ████░░░░░░░░░░░░░
Phase 5 (KV Cache)                               ████░░░░░░░░░
Phase 6 (Queues/Cron)                                ████░░░░░
Phase 7 (Deploy Config)                                  ████░
Phase 8 (Data Migration)                                   ███
```

Phase 1 is the critical path — everything depends on the schema and auth being done first.

---

## Key Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| D1 query performance with complex joins | Slow admin pages, slow checkout | Benchmark early in Phase 1. Denormalize if needed. |
| FTS5 search quality vs tsvector | Worse search results | Test with real product data. FTS5 tokenizer is configurable. |
| Durable Object cold starts | First cart interaction slow | DOs are fast (~1ms wake). Pre-warm on page load if needed. |
| Better Auth feature gap | Missing OAuth flow, admin roles | Better Auth supports Google OAuth + custom fields. Verify admin role pattern works before committing. |
| Stripe on Workers | SDK incompatibility | Stripe JS SDK works with `nodejs_compat`. Test payment flow early. |
| Data migration data loss | Missing orders, broken references | Dry-run migration multiple times. Verify row counts. Run in maintenance window. |
| D1 row/DB size limits | 10GB max, 1MB row max | Product catalog + orders should be well under. Monitor growth. |

---

## Files Deleted After Migration

```
workflows/cleanup.ts
vercel.json
src/routes/api/auth/[...path]/+server.ts  (replaced by Better Auth handler)
src/lib/server/services/reservations.ts    (replaced by StockCoordinator DO)
drizzle/*.sql                              (replaced by D1 migrations)
drizzle/meta/*                             (replaced by D1 migrations)
```

## New Files Created

```
wrangler.toml
src/lib/server/auth.ts                          (Better Auth config)
src/lib/server/durable-objects/cart-session.ts
src/lib/server/durable-objects/stock-coordinator.ts
src/lib/server/cache.ts                          (KV cache wrapper)
src/lib/server/queues/order-processing.ts
src/lib/server/queues/reindex.ts
scripts/migrate-data.ts                          (one-time migration)
scripts/migrate-assets.ts                        (one-time migration)
```
