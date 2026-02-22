# Hoikka Architecture

This document explains how the codebase is structured and how data flows through the system.

## Directory Structure

```
src/
├── lib/
│   ├── server/
│   │   ├── db/
│   │   │   ├── schema.ts      # All database tables (Drizzle ORM)
│   │   │   └── index.ts       # Database client
│   │   ├── i18n.ts            # Translation resolution utilities
│   │   └── services/          # Business logic (server-only)
│   │       ├── orders.ts
│   │       ├── products.ts
│   │       ├── customers.ts
│   │       └── ...
│   ├── remote/                # RPC functions (server code callable from client)
│   │   ├── cart.remote.ts
│   │   └── wishlist.remote.ts
│   ├── stores/                # Client-side state
│   │   └── cart.svelte.ts
│   ├── components/            # Reusable UI components
│   └── types.ts               # Shared TypeScript types
│
└── routes/
    ├── (storefront)/          # Customer-facing pages
    │   ├── +layout.svelte     # Header, cart sheet, footer
    │   ├── products/[id]/[slug]/  # Product detail page
    │   ├── checkout/          # Checkout flow
    │   └── ...
    └── admin/                 # Admin dashboard
        └── ...
```

## Layer Responsibilities

### 1. Database Schema (`src/lib/server/db/schema.ts`)

Single file containing all Drizzle table definitions. This is the source of truth for data structure.

```typescript
export const orders = pgTable("orders", { ... });
export const orderLines = pgTable("order_lines", { ... });
```

### 2. Services (`src/lib/server/services/`)

Business logic layer. Each service is a **singleton class** that:

- Encapsulates all operations for a domain (orders, products, etc.)
- Handles database queries
- Enforces business rules
- Is server-only (cannot be imported in client code)

```typescript
// Example: src/lib/server/services/orders.ts
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
// src/lib/remote/cart.remote.ts
export const addToCart = command("unchecked", async (input) => {
  await orderService.addLine(...);
  return { success: true };
});
```

### 4. Components (`src/lib/components/`)

Reusable Svelte components. Split into:

- `storefront/` - Customer-facing UI
- `admin/` - Admin dashboard UI
- `ui/` - Base components (shadcn/svelte)

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
- Easy to import anywhere: `import { orderService } from "$lib/server/services/orders.js"`
- Testable (can mock the export)

### Translation Resolution

Multi-language support via separate translation tables, resolved at the service layer:

```
products (id, type, visibility, ...)
    │
    └── product_translations (id, product_id, language_code, name, slug, description)
```

Services resolve translations internally using `src/lib/server/i18n.ts` and return `Resolved*` types with flat fields:

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
// src/lib/server/services/payments.ts
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

1. Create `src/lib/server/services/myservice.ts`
2. Export singleton: `export const myService = new MyService()`
3. Add to barrel: `src/lib/server/services/index.ts`

### Adding a New Table

1. Add to `src/lib/server/db/schema.ts`
2. Add relations if needed
3. Run `bun drizzle-kit generate && bun drizzle-kit migrate`
4. Add types to `src/lib/types.ts`

### Adding a Remote Function

1. Create/edit `src/lib/remote/myfeature.remote.ts`
2. Use `command()` wrapper
3. Import and call from component
