# Changelog

Notable changes to the Hoikka template.

Format: [Keep a Changelog](https://keepachangelog.com). `create-hoikka-app` scaffolds from the latest release.

## [Unreleased]

## [0.8.0] - 2026-11-03

Lessons from an ERP-backed B2B store: several handlers per event, an invoice payment provider, a read-only API client, and guards against stale processes and wrong tax codes.

### Upgrade notes

- **`OrderWithRelations` no longer has `payments` or `customer`.** They were always `[]` and `null`; load them with the payment and customer services where you need them.
- **`registerHandler` adds a handler instead of replacing the type's only one.** Your own `order.paid` handler now runs next to the built-in `webhook` handler (a no-op without `ORDER_WEBHOOK_URL`) rather than replacing it. To replace a handler, register it under the same `name`.

### Added

- **An `invoice()` payment provider** for pay-later orders: nothing is charged online, the payment settles at once and the order is placed through the normal checkout, with `order.paid` handlers running as usual.
- **`createApiClient({ readOnly })`** refuses writes with an `ApiReadOnlyError` before they reach the network, so development against a production ERP can't change it. `true` allows `GET`, `HEAD` and `OPTIONS`; a function decides for APIs that read through `POST`.
- **Several handlers per event type, retried independently.** `registerHandler(type, handler, { name })`; the outbox records which handlers have succeeded (`outbox.done_handlers`, migration `0021`), so a retry runs only the rest. Splitting an ERP export and a confirmation email into two handlers means a failing email no longer repeats the export.

### Changed

- **`upsertProductsBySku` and `mirrorRecords` refresh the planner's statistics** (`PRAGMA optimize`, through `refreshStatistics(db)` in `#lib/server/db/statistics.ts`) after a run that changed rows, like `reindexAll`. Best effort: a failing pragma only logs.
- **A Node process whose code is older than the database stops its scheduler.** When another process has applied migrations this one doesn't know, typically a forgotten dev server on a shared database, its scheduled tasks and outbox delivery stop with an error in the log, instead of running old code against the newer data.

### Fixed

- `components.json` declares the `hooks` and `lib` aliases the shadcn-svelte CLI expects, and `#lib/utils` exports the `WithoutChild` and `WithoutChildren` types its components import.
- **An uncategorised product is taxed at its own tax code,** and new products and categories default to `config.tax.defaultRate`. Before, `getProductTaxCode` returned the literal `"standard"` for a product without a category, ignoring the product's `taxCode`, and a store whose rates use other codes got the fallback rate.

## [0.7.1] - 2026-11-03

Group prices apply the same way on the product page, listing cards and in the cart.

### Changed

- **A group price replaces the base price in the cart and on listing cards,** as it already did on the product page. Before, the cart charged `min(base price, group price)`, so a group price above the base price, or any group price on a variant whose base price is 0 (an item sold only on price lists), was undercut: the cart showed a different price than the product page, and such items were ordered at the base price. If you used group prices only as discounts, nothing changes.

## [0.7.0] - 2026-11-03

Listings that scale to large catalogs: filtering and facet counts run on an in-memory facet index.

### Upgrade notes

- **Code that writes `product_search_fts` directly must call `bumpIndexVersion(db)`** (`#lib/server/services/reindex.ts`) afterwards, or listings keep serving the previous rows until the next catalog change. `reindexProduct`, `removeFromIndex` and `reindexAll` already do.

### Changed

- **Listings scale to large catalogs.** `listProducts` filters, counts facets and pages on an in-memory facet index (`#lib/server/services/facet-index.ts`) instead of SQL: at 36,000 products a listing takes a few milliseconds instead of 100–300 ms. The index rebuilds when `search_index_version` changes, which triggers and reindexing bump (migrations `0019`, `0020`). Results are unchanged, except that facet counts now also respect an active price filter and ties in sorted lists break by newest first.
- The node database runs `PRAGMA optimize` when opened and after `reindexAll`, so the query planner has table statistics.
- `ProductListing` shows a facet's first 10 values, and the selected ones, behind a "Show all" toggle.

## [0.6.0] - 2026-10-29

SvelteKit 3, with adapter-node 6 and adapter-cloudflare 8, and core primitives for mirroring an external system (ERP, PIM) into the store.

### Upgrade notes

- **`$lib` is now `#lib`**, a package.json import, and imports need their file extension: `$lib/utils` becomes `#lib/utils.js`, `$lib/components/admin/ui/button` becomes `#lib/components/admin/ui/button/index.js`. `$hoikka/config` is now `#hoikka/config`. CLI scripts run through plain `tsx` can import both. `npx sv migrate sveltekit-3 --tasks lib-alias` rewrites your own files.
- **Environment variables are declared in `src/env.ts`** and read from `$app/env/private` (or `$app/env/public`) instead of `$env/dynamic/*`. A variable that isn't declared can't be read, so add your own there, including any `WEBHOOK_SECRET_<PROVIDER>`. `SSO_<ID>_*` variables are declared from `hoikka.config.ts`.
- **`ORIGIN` is gone (Node).** adapter-node now treats requests as HTTPS, which is right behind a TLS-terminating proxy, so remove `ORIGIN` from your deploy. Served over plain HTTP, a production build rejects form posts as cross-site: check builds locally with `pnpm preview`, not `pnpm start`.
- **Cloudflare bindings come from `cloudflare:workers`**, through `#lib/server/cloudflare.ts`, not `event.platform`. Code reading `platform.env`, `platform.ctx` or `platform.caches` should import `bindings`, `waitUntil` or `defaultCache` from there instead.
- **`svelte.config.js` and `hoikka-target.js` are gone.** SvelteKit options and the `HOIKKA_TARGET` switch live in `vite.config.ts`.

### Changed

- SvelteKit 3 (`@sveltejs/kit` 3.1, `@sveltejs/adapter-node` 6, `@sveltejs/adapter-cloudflare` 8). `handleError` now only logs and reports unexpected errors; `error(...)`, 404s and invalid remote-function input keep SvelteKit's defaults.
- Unit tests read env from one shared test env (`vitest.setup.ts`, `#lib/server/test-env.ts`) that starts with an in-memory database, instead of mocking `$env/dynamic/private` per file.

### Added

- **`mirrorRecords()`** (`#lib/server/integrations/mirror.ts`) mirrors records from an external system (ERP, PIM) into a table keyed by their external id. Unchanged records are skipped by a stored hash; a changed record's rows, outbox events and new hash are written in one atomic batch, so a failure is retried on the next run without losing its notifications. Records missing from a complete pull go one by one to an optional `removed` callback. Returns counts for the task run summary.
- **`upsertProductsBySku(rows, { productType, hideMissing })`** (`#lib/server/services/external-products.ts`) keeps products owned by an external system in sync, one variant per SKU, so a sync never writes `products` or `productVariants` itself. It writes only the product type's `readOnly` custom fields (the admin's stay untouched), hides inactive products, and with `hideMissing` missing ones, as drafts rather than deleting them, and reindexes search only for products that changed.
- **`createApiClient()`** (`#lib/server/api-client.ts`) for an external system's API: OAuth2 client-credentials tokens cached until shortly before expiry and refreshed once on a `401`, a per-attempt timeout, retries with backoff on network errors and `5xx` (idempotent methods only), `429` retried after its `Retry-After`, a JSON helper, and `collection()` for OData-style `$top`/`$skip` paging that fails rather than return a partial pull past its cap. For a private CA on Node, start the process with `NODE_EXTRA_CA_CERTS`.
- **Task failure reports.** A scheduled task that starts failing, including a run that timed out, is reported once until it succeeds again, not on every failed run. A task can set its own `onFailure(failure)`; the default, `reportTaskFailure`, logs it.
- **`SENTRY_DSN`** also sends unexpected server errors and task failure reports to Sentry, over plain `fetch` on both targets, without the SDK.

## [0.5.0] - 2026-10-27

Node target ready for container deploys (e.g. Kamal on a VPS, SQLite on a mounted volume, uploads in object storage), all opt-in through env vars, and every dependency updated.

### Upgrade notes

- **Node 22.23.4, 24.22.1 or 26.12.1 is now required** (the [October 2026 security releases](https://nodejs.org/en/blog/vulnerability/october-2026-security-releases)). Node 20 is end-of-life and unpatched, and `engine-strict` makes `pnpm install` refuse older versions. Rebuild container images so they ship a patched runtime.
- **Staff SSO callback URL changed** to `/api/auth/callback/<id>` (was `/api/auth/oauth2/callback/<id>`) with better-auth 1.7. Update the redirect URI registered at each identity provider before deploying, or staff sign-in fails. Accounts keep matching on the ID token's `sub`, so existing staff accounts carry over.

### Added

- **Health endpoint.** `GET`/`HEAD /api/health` returns `200 {"ok":true}` when the database answers with the schema in place, otherwise `503`. Public, `no-store`, and skips auth. For deploy healthchecks and uptime monitors, on both targets.
- **S3-compatible storage.** Setting `S3_BUCKET`, `S3_ACCESS_KEY_ID` and `S3_SECRET_ACCESS_KEY` (plus optional `S3_ENDPOINT`, `S3_REGION`, `S3_PREFIX`) keeps uploads in any S3-compatible bucket (AWS S3, UpCloud Object Storage, Hetzner, MinIO) on the Node target. Files are still served through `/uploads/...`, so the bucket can stay private; digital deliverables stream up as multipart uploads.
- **Configurable paths.** `UPLOADS_DIR` (default `data/uploads`), `CACHE_DIR` for resized images (default `<UPLOADS_DIR>/.cache`) and `MIGRATIONS_DIR` (default `drizzle`).
- **`DATABASE_MUST_EXIST=1`** makes the Node target refuse to start when the `DATABASE_URL` file is missing, instead of creating and migrating an empty database that `/api/health` would report as healthy. Off by default; turn it on once the first deploy has created the database.
- **`pnpm db:check`** exits 1 when the schema has changes without a generated migration. Runs in CI.

### Changed

- Dependencies updated, including better-auth 1.7, better-sqlite3 13, Stripe 23 (API version `2026-09-30.endive`; Hoikka uses none of its removed parameters), `@stripe/stripe-js` 10, devalue 6 and vitest 5.
- Staff SSO ID tokens are now verified against the provider's JWKS (signature, issuer and nonce) before their claims are read, and sign-in is refused if the discovery document doesn't publish the keys to do so.
- Resized images on Node are cached per original (`<CACHE_DIR>/<path>/w<w>q<q>.webp`) and served without reading the original on a cache hit. Deleting an asset drops its cached sizes. The old cache layout is no longer read, so the existing `data/uploads/.cache` can be deleted.

### Fixed

- **Migrations no longer cascade-delete rows on Node.** Foreign keys are now off while migrations run. Before, a table rebuild (drizzle-kit's create / copy / drop / rename) dropped the old table with foreign keys on, which would delete the rows of child tables with `ON DELETE CASCADE`. The only rebuild so far (`0006`, `digital_downloads`) has no child tables, so no data was lost. When a boot applies migrations, a `PRAGMA foreign_key_check` afterwards stops startup if they left dangling references. Boots with nothing to apply skip the check, which scans the whole database.
