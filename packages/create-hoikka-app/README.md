# create-hoikka-app

Scaffold a [Hoikka](https://hoikka.dev) ecommerce store.

```bash
pnpx create-hoikka-app my-store
```

The CLI clones the latest Hoikka release, then asks where you want to run it:

- **Local / Node.js** — SQLite file + local uploads. `pnpm dev` and you're selling.
- **Cloudflare** — Workers + D1 + R2. The CLI can create the resources and deploy for you.

Switching targets later is one line: flip `HOIKKA_TARGET` in `.env`.

Requirements: Node >= 20, `pnpm`, `git`. Optional: `gh` (GitHub repo creation), a Cloudflare account (cloudflare target).
