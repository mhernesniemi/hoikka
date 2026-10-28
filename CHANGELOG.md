# Changelog

Notable changes to the Hoikka template.

Format: [Keep a Changelog](https://keepachangelog.com). `create-hoikka-app` scaffolds from the latest release.

## [Unreleased]

### Added

- **`mirrorRecords()`** (`$lib/server/integrations/mirror.ts`) mirrors records from an external system (ERP, PIM) into a table keyed by their external id. Unchanged records are skipped by a stored hash; a changed record's rows, outbox events and new hash are written in one atomic batch, so a failure is retried on the next run without losing its notifications. Records missing from a complete pull go to an optional `removed` callback. Returns counts for the task run summary.
- **`productService.upsertProductsBySku(rows, { productType, hideMissing })`** keeps products owned by an external system in sync, one variant per SKU, so a sync never writes `products` or `productVariants` itself. It writes only the product type's `readOnly` custom fields (the admin's stay untouched), hides inactive products, and with `hideMissing` missing ones, as drafts rather than deleting them, and reindexes search only for products that changed.

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
