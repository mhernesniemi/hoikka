# Hoikka

## General Guidelines

- When adding a new feature or data field, always implement it in **both** the admin panel and the storefront. For example, adding an image field to a model means updating the admin edit page, the server actions, **and** the storefront page that renders it (including relevant meta tags).
- This project uses Svelte 5. Avoid outdated Svelte 4 patterns.
- Add tests where appropriate when adding a new feature or modifying existing code.
- Keep the codebase lightweight and easy to understand.
- When modifying code, remove any functions, variables, imports, or declarations that become unused as a result of the change. Do not leave dead code behind.
- When adding fields to the `products` schema, also update the manually constructed `ProductWithRelations` object in `src/lib/components/storefront/ProductListing.svelte` (`toProductCard`).

## Layout: the core is a package

- `src/hoikka/` is the **@hoikka/core** workspace package (raw TS/Svelte source, no build step). It holds everything managed: `server/` (db, services, payments, storage), `routes/` (admin/api/uploads implementations), `admin/` (admin UI components), `remote/` (remote-function schemas + handlers), `fields/`, `config/`, `shared/` (types, utils, image helpers), `drizzle/` (migrations), `vite.mjs`, and `internals/` (the `hoikka` CLI: `sync-routes`, `migrations:stage`, `eject`).
- Everything else is **project-owned**: `hoikka.config.ts` (store settings + custom-field definitions — the config surface), `src/routes/` (storefront pages plus ~65 thin admin/api shims that re-export package modules), `src/lib/` (storefront components, `.remote.ts` wrappers, re-export stubs), `src/hooks.server.ts`.
- Import package code as `@hoikka/core/...` (extensionless), never via relative paths across the `src/hoikka` boundary. Config is reached via the `$hoikka/config` alias.
- After adding/renaming a file under `src/hoikka/routes/`, run `pnpm exec hoikka sync-routes --write` to regenerate the app shims. Shim files carry a `Hoikka route shim` marker; a shim without the marker is a user override — leave it alone.
- The package boundary is `src/hoikka/package.json` `"files"` — the single source of truth consumed by eject, `pnpm verify:pack`, and `pnpm verify:package` (the anti-drift gate that assembles a package-mode project from a packed tarball and smoke-tests it, including an eject round-trip). Run both after changing the package surface.
- Scaffolds come in two modes (`create-hoikka-app --mode=package|embedded`): package mode has no `src/hoikka/` and depends on the published @hoikka/core; embedded mode is this repo's layout. Package-mode users cannot author core DB migrations (eject is the escape hatch) — keep that in mind when designing features.

## Tools

- Run `pnpm check` for type checking.
- After modifying files, run `pnpm exec prettier --write <files>` on the changed files to format them.
- When making changes to the DB schema, generate a migration with `pnpm db:generate`. On the Node target, migrations apply automatically when the server starts (dev or production). On the Cloudflare target, apply them with `pnpm db:migrate:cf` (stages package migrations into `.hoikka/migrations`, then `wrangler d1 migrations apply`). Do **not** use `drizzle-kit push`.
- **Reverting schema changes**: If a migration is reverted, you must also delete its SQL file (`src/hoikka/drizzle/NNNN_*.sql`), its snapshot (`src/hoikka/drizzle/meta/NNNN_snapshot.json`), and remove its entry from `src/hoikka/drizzle/meta/_journal.json`. Leftover files will cause the next `db:generate` to fail or produce broken migrations.

## UI Guidelines

- Use shadcn/svelte for UI components and install new ones as needed. The project has **two separate UI component sets**: `src/hoikka/admin/ui/` (admin panel) is styled with **semantic tokens** (`bg-surface`, `text-foreground`, `bg-primary`, …) defined under `[data-admin]` in `src/hoikka/routes/admin/admin.css` and is meant to stay stable/stock; `src/lib/components/storefront/ui/` (storefront) uses **literal Tailwind classes** (no token indirection) and is meant to be freely customized. The `components.json` `ui` alias points to storefront, so `pnpm dlx shadcn-svelte@next add <component>` installs there by default. After installing, copy the component to the correct path (admin or storefront) and delete the copy you don't need.
- Prefer existing UI components (e.g. `<Button>` over `<button>`).
- Use `cn()` for conditional Tailwind classes. Never use string interpolation in `class` attributes — always use `cn()` instead.
- Use `<AdminCard>` for card sections on admin detail pages.
- Admin UI components that use portals (dialogs, tooltips, popovers, etc.) must portal into `[data-admin]` (e.g. `to="[data-admin]"`) so that the admin theme CSS variables are available.
- Never nest `<a>` and `<Button>` — for link-styled buttons use `buttonVariants()` on the `<a>` directly (e.g. `<a class={buttonVariants({ variant: "ghost", size: "icon" })}>`).
- Remember to include responsiveness.
