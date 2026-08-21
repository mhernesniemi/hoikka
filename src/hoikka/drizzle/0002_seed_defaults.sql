-- Seed default shipping and payment methods.
-- Replaces the lazy init that previously ran from hooks.server.ts on first request.
INSERT INTO shipping_methods (code, name, description, active, createdAt, updatedAt)
VALUES ('flat_rate', 'Standard Shipping', 'Flat rate standard delivery', 1, (strftime('%s','now') * 1000), (strftime('%s','now') * 1000))
ON CONFLICT (code) DO NOTHING;--> statement-breakpoint
INSERT INTO payment_methods (code, name, description, active, createdAt, updatedAt)
VALUES ('mock', 'Mock Payment', 'Mock payment for development and testing', 1, (strftime('%s','now') * 1000), (strftime('%s','now') * 1000))
ON CONFLICT (code) DO NOTHING;--> statement-breakpoint
INSERT INTO payment_methods (code, name, description, active, createdAt, updatedAt)
VALUES ('stripe', 'Stripe', 'Pay with credit card via Stripe', 1, (strftime('%s','now') * 1000), (strftime('%s','now') * 1000))
ON CONFLICT (code) DO NOTHING;
