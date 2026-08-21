# Hoikka Architecture

This document explains how the codebase is structured and how data flows through the system.

## Distribution Modes

The managed core lives in `src/hoikka/` as the **@hoikka/core** workspace package — raw TypeScript/Svelte source, no build step, compiled inside the app's Vite pipeline (`ssr.noExternal`). A project consumes it one of two ways:

- **Embedded** (this repo's layout): the full source sits in `src/hoikka/`, linked as `workspace:*`. Yours to modify; upgrades arrive by merging from the template.
- **Package**: no `src/hoikka/` — the same source installs from npm as `@hoikka/core@^x.y.z`. Upgrades are a version bump. Core DB migrations can't be authored in this mode; `pnpm exec hoikka eject` converts one-way to embedded when you need schema ownership.

Import specifiers are identical in both modes (`@hoikka/core/...`), which is what makes eject a plain copy. The package boundary is `src/hoikka/package.json` `"files"`; `pnpm verify:pack` and `pnpm verify:package` keep it honest.

## Directory Structure

```
hoikka/
├── hoikka.config.ts           # PROJECT-OWNED: store settings + custom-field definitions
├── src/
│   ├── hoikka/                # === @hoikka/core (managed; absent in package mode) ===
│   │   ├── server/
│   │   │   ├── db/            #   schema.ts, client seams (node/cloudflare), config
│   │   │   ├── services/      #   business logic (orders, products, payments, ...)
│   │   │   └── ...            #   auth, email, storage, images, i18n
│   │   ├── routes/            #   admin/api/uploads implementations + hooks.ts
│   │   ├── admin/             #   admin UI components (ui primitives, tiptap, tables)
│   │   ├── remote/            #   remote-function schemas + handlers
│   │   ├── fields/            #   custom-field types, valibot validation, renderer
│   │   ├── config/            #   defineHoikkaConfig, defaults, provider descriptors
│   │   ├── shared/            #   types, utils, image helpers (used by storefront too)
│   │   ├── drizzle/           #   migrations (source of truth)
│   │   └── internals/         #   `hoikka` CLI: sync-routes, migrations:stage, eject
│   ├── lib/                   # PROJECT-OWNED
│   │   ├── components/storefront/  # customer-facing UI, freely customized
│   │   ├── remote/*.remote.ts      # thin $app/server wrappers around @hoikka/core/remote/*
│   │   └── ...                     # re-export stubs keeping $lib paths stable
│   ├── routes/                # PROJECT-OWNED
│   │   ├── (storefront)/      #   customer-facing pages
│   │   ├── admin/, api/, ...  #   thin shims re-exporting @hoikka/core/routes/*
│   │   └── ...                #   (managed by `hoikka sync-routes`; override by editing)
│   └── hooks.server.ts        # PROJECT-OWNED: sequence(...hoikkaHandles)
└── packages/create-hoikka-app/
```

Project-owned files are public API: package-mode users upgrade with only a dependency bump, so changes to the managed core must never require edits to shims, config, or wiring.

## Layer Responsibilities

### 1. Database Schema (`src/hoikka/server/db/schema.ts`)

Single file containing all Drizzle table definitions. This is the source of truth for data structure.

```typescript
export const orders = sqliteTable("orders", { ... });
export const orderItems = sqliteTable("order_items", { ... });
```

### 2. Services (`src/hoikka/server/services/`)

Business logic layer. Each service is a **singleton class** that:

- Encapsulates all operations for a domain (orders, products, etc.)
- Handles database queries
- Enforces business rules
- Is server-only (cannot be imported in client code)

```typescript
// Example: src/hoikka/server/services/orders.ts
class OrderService {
  async addLine(orderId: number, input: AddOrderLineInput) { ... }
  async transitionState(orderId: number, newState: OrderState) { ... }
}
export const orderService = new OrderService();
```

### 3. Routes (`src/routes/`)

SvelteKit routes handle HTTP requests. Two patterns are used:

**Form Actions** - For form submissions with progressive enhancement:

```typescript
// +page.server.ts
export const actions = {
  addToCart: async ({ request }) => {
    const data = await request.formData();
    await orderService.addLine(...);
    return { success: true };
  }
};
```

**Remote Functions** - For RPC-style calls without page reload:

```typescript
// src/lib/remote/cart.remote.ts — thin wrapper binding $app/server
import * as remote from "@hoikka/core/remote/cart";
export const getCart = query(remote.getCart);
const handlers = remote.commands(() => getCart().refresh());
export const addToCart = command(remote.schemas.addToCart, handlers.addToCart);
```

### 4. Components

- `src/lib/components/storefront/` - customer-facing UI (project-owned, freely customized; `ui/` holds the shadcn/svelte base components)
- `src/hoikka/admin/` - admin dashboard UI (managed, stays stock)

## Data Flow

### Server-Side Rendering (Page Load)

```
Browser Request
    ↓
hooks.server.ts (auth, cart, wishlist)
    ↓
+page.server.ts (load function calls services)
    ↓
Service (resolves translations, returns Resolved* types)
    ↓
Database (via Drizzle)
    ↓
+page.svelte (receives resolved data: product.name)
    ↓
HTML Response
```

### Client-Side Interaction (Remote Functions)

```
User clicks "Add to Cart"
    ↓
Component calls addToCart({ variantId, quantity })
    ↓
SvelteKit serializes & sends to server
    ↓
cart.remote.ts executes on server
    ↓
orderService.addLine()
    ↓
Response sent to client
    ↓
Component receives result, updates UI
```

---

## Example Flows

### Flow 1: Adding Item to Cart

```
1. User clicks "Add to Cart" on product page

2. products/[slug]/+page.svelte
   └── handleAddToCart()
       └── await addToCart({ variantId, quantity })

3. src/lib/remote/cart.remote.ts (SERVER)
   └── command() executes on server
       └── orderService.getOrCreateActiveCart()
       └── orderService.addLine()
           └── Check available stock (via reservationService)
           └── Insert into order_lines table
           └── Create stock reservation
       └── Return { success: true }

4. Back in component (CLIENT)
   └── cartSheet.open()  ← Opens the cart sheet
   └── invalidateAll()   ← Refreshes page data in background
```

### Flow 2: Order Checkout (Cart to Paid)

```
                                    ┌─────────────────────┐
                                    │   ORDER STATES      │
                                    ├─────────────────────┤
  ┌──────────┐                      │ • created (cart)    │
  │  Start   │                      │ • payment_pending   │
  └────┬─────┘                      │ • paid              │
       │                            │ • shipped           │
       ▼                            │ • delivered         │
┌──────────────┐                    │ • cancelled         │
│ Add to Cart  │                    └─────────────────────┘
│ (state:      │
│  created)    │
└──────┬───────┘
       │ Stock reserved (15 min expiry)
       ▼
┌──────────────┐
│ Set Shipping │  POST /checkout?/setShippingAddress
│ Address      │  └── orderService.setShippingAddress()
└──────┬───────┘
       │
       ▼
┌──────────────┐
│ Set Shipping │  POST /checkout?/setShippingMethod
│ Method       │  └── shippingService.setShippingMethod()
└──────┬───────┘
       │
       ▼
┌──────────────┐
│ Create       │  POST /checkout?/createPayment
│ Payment      │  └── paymentService.createPayment()
└──────┬───────┘      └── Creates Stripe PaymentIntent (or mock)
       │
       ▼
┌──────────────┐
│ Complete     │  POST /checkout?/completeOrder
│ Order        │
└──────┬───────┘
       │
       ├──► orderService.transitionState("payment_pending")
       │    └── Marks cart as inactive
       │    └── Extends stock reservations
       │
       ├──► paymentService.confirmPayment()
       │    └── Confirms with payment provider
       │
       ├──► orderService.transitionState("paid")
       │    └── Validates stock one final time
       │    └── Deducts stock from variants
       │    └── Releases reservations (no longer needed)
       │    └── Updates promotion usage counts
       │
       ├──► shippingService.createShipment()
       │    └── Creates shipment with carrier
       │
       └──► Redirect to /checkout/thank-you
```

### Flow 3: Stock Reservation Lifecycle

```
┌─────────────────────────────────────────────────────────────┐
│                    STOCK RESERVATION                         │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  variant.stock = 10 (database)                              │
│                                                              │
│  User A adds 3 to cart                                      │
│  └── Reservation created: { variantId, qty: 3, expires: +15min }
│  └── Available stock: 10 - 3 = 7                            │
│                                                              │
│  User B adds 5 to cart                                      │
│  └── Reservation created: { variantId, qty: 5, expires: +15min }
│  └── Available stock: 10 - 3 - 5 = 2                        │
│                                                              │
│  User C tries to add 3                                      │
│  └── ERROR: "Only 2 items available"                        │
│                                                              │
│  ─── 15 minutes pass, User A abandons cart ───              │
│                                                              │
│  User A's reservation expires                               │
│  └── Available stock: 10 - 5 = 5                            │
│                                                              │
│  User B completes checkout                                  │
│  └── Stock deducted: variant.stock = 10 - 5 = 5            │
│  └── Reservation released (no longer needed)                │
│                                                              │
│  Final: variant.stock = 5, no active reservations           │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## Key Patterns

### Service Singletons

Services are instantiated once and exported:

```typescript
class OrderService { ... }
export const orderService = new OrderService();
```

This ensures:

- Single database connection pool usage
- Easy to import anywhere: `import { orderService } from "@hoikka/core/server/services/orders"`
- Testable (can mock the export)

### Translation Resolution

Multi-language support via separate translation tables, resolved at the service layer:

```
products (id, type, visibility, ...)
    │
    └── product_translations (id, product_id, language_code, name, slug, description)
```

Services resolve translations internally using `src/hoikka/server/i18n.ts` and return `Resolved*` types with flat fields:

```typescript
// Service resolves translations — components access flat fields
const product = await productService.getById(123);
product.name; // "Blue Shirt" (resolved)
product.translations; // Still available for editing forms
```

Services default to `DEFAULT_LANGUAGE`. When multi-language support is needed, a per-request language can be passed to services.

### Guest Carts (Cookie-based)

Anonymous users get a cart via cookie token:

```typescript
// On first add-to-cart, generate token
const cartToken = nanoid();
cookies.set("cart_token", cartToken, { ... });

// On subsequent requests, look up by token
const cart = await orderService.getActiveCart({ cartToken });
```

When user signs in, cart is transferred to their customer ID.

### Provider Pattern (Payments/Shipping)

Extensible integrations via provider interface:

```typescript
// src/hoikka/server/services/payments.ts
interface PaymentProvider {
  createPayment(order: Order): Promise<PaymentResult>;
  confirmPayment(paymentId: string): Promise<PaymentStatus>;
}

// Implementations
class StripeProvider implements PaymentProvider { ... }
class MockProvider implements PaymentProvider { ... }
```

---

## File Naming Conventions

| Pattern           | Purpose                                         |
| ----------------- | ----------------------------------------------- |
| `*.svelte`        | Svelte components                               |
| `*.svelte.ts`     | TypeScript with Svelte runes ($state, $derived) |
| `+page.svelte`    | Route page component                            |
| `+page.server.ts` | Route server-side load/actions                  |
| `+layout.svelte`  | Shared layout component                         |
| `*.remote.ts`     | RPC functions (command())                       |
| `index.ts`        | Barrel exports                                  |

---

## Common Tasks

### Adding a New Service

1. Create `src/hoikka/server/services/myservice.ts`
2. Export singleton: `export const myService = new MyService()`
3. Add to barrel: `src/hoikka/server/services/index.ts`

### Adding a New Table

1. Add to `src/hoikka/server/db/schema.ts`
2. Add relations if needed
3. Run `pnpm db:generate` (node target migrates automatically on boot; Cloudflare via `pnpm db:migrate:cf`)
4. Add types to `src/hoikka/shared/types.ts`

### Adding a Remote Function

1. Add the schema + handler in `src/hoikka/remote/myfeature.ts` (no `$app/server` there)
2. Bind it in a thin `src/lib/remote/myfeature.remote.ts` wrapper with `query()`/`command()`
3. Import and call from a component

### Adding an Admin Route

1. Implement it under `src/hoikka/routes/` (`page.server.ts` / `Page.svelte` naming)
2. Run `pnpm exec hoikka sync-routes --write` to generate the app shim
