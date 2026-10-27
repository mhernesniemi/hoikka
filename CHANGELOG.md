# Changelog

Notable changes to the Hoikka template.

Format: [Keep a Changelog](https://keepachangelog.com). `create-hoikka-app` scaffolds from the latest release.

## [Unreleased]

Node target ready for container deploys (e.g. Kamal on a VPS, SQLite on a mounted volume, uploads in object storage). All opt-in through env vars; existing projects need no changes.

### Added

- **Health endpoint.** `GET`/`HEAD /api/health` returns `200 {"ok":true}` when the database answers with the schema in place, otherwise `503`. Public, `no-store`, and skips auth. For deploy healthchecks and uptime monitors, on both targets.
- **S3-compatible storage.** Setting `S3_BUCKET`, `S3_ACCESS_KEY_ID` and `S3_SECRET_ACCESS_KEY` (plus optional `S3_ENDPOINT`, `S3_REGION`, `S3_PREFIX`) keeps uploads in any S3-compatible bucket (AWS S3, UpCloud Object Storage, Hetzner, MinIO) on the Node target. Files are still served through `/uploads/...`, so the bucket can stay private; digital deliverables stream up as multipart uploads.
- **Configurable paths.** `UPLOADS_DIR` (default `data/uploads`), `CACHE_DIR` for resized images (default `<UPLOADS_DIR>/.cache`) and `MIGRATIONS_DIR` (default `drizzle`).
- **`pnpm db:check`** exits 1 when the schema has changes without a generated migration. Runs in CI.

### Changed

- Resized images on Node are cached per original (`<CACHE_DIR>/<path>/w<w>q<q>.webp`) and served without reading the original on a cache hit. Deleting an asset drops its cached sizes. The old cache layout is no longer read, so the existing `data/uploads/.cache` can be deleted.

### Fixed

- **Migrations no longer cascade-delete rows on Node.** Foreign keys are now off while migrations run. Before, a table rebuild (drizzle-kit's create / copy / drop / rename) dropped the old table with foreign keys on, which would delete the rows of child tables with `ON DELETE CASCADE`. The only rebuild so far (`0006`, `digital_downloads`) has no child tables, so no data was lost. A `PRAGMA foreign_key_check` afterwards stops startup if a migration leaves dangling references.
