CREATE TABLE "addresses" (
	"id" serial PRIMARY KEY NOT NULL,
	"customer_id" integer NOT NULL,
	"full_name" varchar(255),
	"company" varchar(255),
	"street_line_1" varchar(255) NOT NULL,
	"street_line_2" varchar(255),
	"city" varchar(100) NOT NULL,
	"postal_code" varchar(20) NOT NULL,
	"country" varchar(100) NOT NULL,
	"phone_number" varchar(50),
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assets" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"type" text NOT NULL,
	"mime_type" varchar(100) NOT NULL,
	"width" integer DEFAULT 0,
	"height" integer DEFAULT 0,
	"file_size" integer DEFAULT 0,
	"source" varchar(500) NOT NULL,
	"alt" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255) DEFAULT '' NOT NULL,
	"parent_id" integer,
	"slug" varchar(255) NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"featured_asset_id" integer,
	"tax_code" varchar(20) DEFAULT 'standard' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "categories_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "category_translations" (
	"id" serial PRIMARY KEY NOT NULL,
	"category_id" integer NOT NULL,
	"language_code" varchar(10) NOT NULL,
	"name" varchar(255) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "collection_filters" (
	"id" serial PRIMARY KEY NOT NULL,
	"collection_id" integer NOT NULL,
	"field" text NOT NULL,
	"operator" text NOT NULL,
	"value" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "collection_translations" (
	"id" serial PRIMARY KEY NOT NULL,
	"collection_id" integer NOT NULL,
	"language_code" varchar(10) NOT NULL,
	"name" varchar(255) NOT NULL,
	"slug" varchar(255) NOT NULL,
	"description" text
);
--> statement-breakpoint
CREATE TABLE "collections" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255) DEFAULT '' NOT NULL,
	"slug" varchar(255) DEFAULT '' NOT NULL,
	"description" text,
	"is_private" boolean DEFAULT false NOT NULL,
	"featured_asset_id" integer,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_page_translations" (
	"id" serial PRIMARY KEY NOT NULL,
	"content_page_id" integer NOT NULL,
	"language_code" varchar(10) NOT NULL,
	"title" varchar(255) NOT NULL,
	"slug" varchar(255) NOT NULL,
	"body" text
);
--> statement-breakpoint
CREATE TABLE "content_pages" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" varchar(255) DEFAULT '' NOT NULL,
	"slug" varchar(255) DEFAULT '' NOT NULL,
	"body" text,
	"image_url" varchar(500),
	"published" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer_group_members" (
	"customer_id" integer NOT NULL,
	"group_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "customer_group_members_customer_id_group_id_pk" PRIMARY KEY("customer_id","group_id")
);
--> statement-breakpoint
CREATE TABLE "customer_groups" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" varchar(100) NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"is_tax_exempt" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "customer_groups_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" serial PRIMARY KEY NOT NULL,
	"auth_user_id" varchar(255),
	"email" varchar(255) NOT NULL,
	"first_name" varchar(100) NOT NULL,
	"last_name" varchar(100) NOT NULL,
	"phone" varchar(50),
	"vat_id" varchar(50),
	"is_admin" boolean DEFAULT false NOT NULL,
	"deleted_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "customers_auth_user_id_unique" UNIQUE("auth_user_id")
);
--> statement-breakpoint
CREATE TABLE "facet_translations" (
	"id" serial PRIMARY KEY NOT NULL,
	"facet_id" integer NOT NULL,
	"language_code" varchar(10) NOT NULL,
	"name" varchar(255) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "facet_value_translations" (
	"id" serial PRIMARY KEY NOT NULL,
	"facet_value_id" integer NOT NULL,
	"language_code" varchar(10) NOT NULL,
	"name" varchar(255) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "facet_values" (
	"id" serial PRIMARY KEY NOT NULL,
	"facet_id" integer NOT NULL,
	"name" varchar(255) DEFAULT '' NOT NULL,
	"code" varchar(255) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "facets" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255) DEFAULT '' NOT NULL,
	"code" varchar(255) NOT NULL,
	"is_private" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "facets_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "order_lines" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer NOT NULL,
	"variant_id" integer NOT NULL,
	"quantity" integer NOT NULL,
	"unit_price" integer NOT NULL,
	"line_total" integer NOT NULL,
	"tax_code" varchar(20) DEFAULT 'standard' NOT NULL,
	"tax_rate" numeric(5, 4) DEFAULT '0.24' NOT NULL,
	"tax_amount" integer DEFAULT 0 NOT NULL,
	"unit_price_net" integer DEFAULT 0 NOT NULL,
	"line_total_net" integer DEFAULT 0 NOT NULL,
	"product_name" varchar(255) NOT NULL,
	"variant_name" varchar(255),
	"sku" varchar(255) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_promotions" (
	"order_id" integer NOT NULL,
	"promotion_id" integer NOT NULL,
	"discount_amount" integer NOT NULL,
	"type" text DEFAULT 'order' NOT NULL,
	CONSTRAINT "order_promotions_order_id_promotion_id_pk" PRIMARY KEY("order_id","promotion_id")
);
--> statement-breakpoint
CREATE TABLE "order_shipping" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer NOT NULL,
	"shipping_method_id" integer NOT NULL,
	"tracking_number" varchar(255),
	"status" text DEFAULT 'pending' NOT NULL,
	"price" integer NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" varchar(50) NOT NULL,
	"customer_id" integer,
	"cart_token" varchar(64),
	"active" boolean DEFAULT true NOT NULL,
	"state" text DEFAULT 'created' NOT NULL,
	"subtotal" integer DEFAULT 0 NOT NULL,
	"shipping" integer DEFAULT 0 NOT NULL,
	"discount" integer DEFAULT 0 NOT NULL,
	"total" integer DEFAULT 0 NOT NULL,
	"tax_total" integer DEFAULT 0 NOT NULL,
	"total_net" integer DEFAULT 0 NOT NULL,
	"is_tax_exempt" boolean DEFAULT false NOT NULL,
	"currency_code" varchar(3) DEFAULT 'EUR' NOT NULL,
	"exchange_rate" numeric(10, 6) DEFAULT '1' NOT NULL,
	"shipping_full_name" varchar(255),
	"shipping_street_line_1" varchar(255),
	"shipping_street_line_2" varchar(255),
	"shipping_city" varchar(100),
	"shipping_postal_code" varchar(20),
	"shipping_country" varchar(100),
	"customer_email" varchar(255),
	"order_placed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "orders_code_unique" UNIQUE("code"),
	CONSTRAINT "orders_cart_token_unique" UNIQUE("cart_token")
);
--> statement-breakpoint
CREATE TABLE "payment_methods" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" varchar(100) NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "payment_methods_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer NOT NULL,
	"payment_method_id" integer NOT NULL,
	"method" varchar(100) NOT NULL,
	"amount" integer NOT NULL,
	"state" text DEFAULT 'pending' NOT NULL,
	"transaction_id" varchar(255),
	"error_message" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_assets" (
	"product_id" integer NOT NULL,
	"asset_id" integer NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "product_assets_product_id_asset_id_pk" PRIMARY KEY("product_id","asset_id")
);
--> statement-breakpoint
CREATE TABLE "product_categories" (
	"product_id" integer NOT NULL,
	"category_id" integer NOT NULL,
	CONSTRAINT "product_categories_product_id_category_id_pk" PRIMARY KEY("product_id","category_id")
);
--> statement-breakpoint
CREATE TABLE "product_facet_values" (
	"product_id" integer NOT NULL,
	"facet_value_id" integer NOT NULL,
	CONSTRAINT "product_facet_values_product_id_facet_value_id_pk" PRIMARY KEY("product_id","facet_value_id")
);
--> statement-breakpoint
CREATE TABLE "product_translations" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" integer NOT NULL,
	"language_code" varchar(10) NOT NULL,
	"name" varchar(255) NOT NULL,
	"slug" varchar(255) NOT NULL,
	"description" text
);
--> statement-breakpoint
CREATE TABLE "product_variant_assets" (
	"variant_id" integer NOT NULL,
	"asset_id" integer NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "product_variant_assets_variant_id_asset_id_pk" PRIMARY KEY("variant_id","asset_id")
);
--> statement-breakpoint
CREATE TABLE "product_variant_group_prices" (
	"id" serial PRIMARY KEY NOT NULL,
	"variant_id" integer NOT NULL,
	"group_id" integer NOT NULL,
	"price" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_variant_translations" (
	"id" serial PRIMARY KEY NOT NULL,
	"variant_id" integer NOT NULL,
	"language_code" varchar(10) NOT NULL,
	"name" varchar(255)
);
--> statement-breakpoint
CREATE TABLE "product_variants" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" integer NOT NULL,
	"name" varchar(255),
	"sku" varchar(255) NOT NULL,
	"price" integer NOT NULL,
	"stock" integer DEFAULT 0 NOT NULL,
	"track_inventory" boolean DEFAULT true NOT NULL,
	"featured_asset_id" integer,
	"image_url" varchar(500),
	"deleted_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255) DEFAULT '' NOT NULL,
	"slug" varchar(255) DEFAULT '' NOT NULL,
	"description" text,
	"type" text DEFAULT 'physical' NOT NULL,
	"visibility" text DEFAULT 'public' NOT NULL,
	"tax_code" varchar(20) DEFAULT 'standard' NOT NULL,
	"featured_asset_id" integer,
	"deleted_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "promotion_collections" (
	"promotion_id" integer NOT NULL,
	"collection_id" integer NOT NULL,
	CONSTRAINT "promotion_collections_promotion_id_collection_id_pk" PRIMARY KEY("promotion_id","collection_id")
);
--> statement-breakpoint
CREATE TABLE "promotion_products" (
	"promotion_id" integer NOT NULL,
	"product_id" integer NOT NULL,
	CONSTRAINT "promotion_products_promotion_id_product_id_pk" PRIMARY KEY("promotion_id","product_id")
);
--> statement-breakpoint
CREATE TABLE "promotions" (
	"id" serial PRIMARY KEY NOT NULL,
	"method" text DEFAULT 'code' NOT NULL,
	"code" varchar(50),
	"title" varchar(255),
	"promotion_type" text DEFAULT 'order' NOT NULL,
	"discount_type" text NOT NULL,
	"discount_value" integer NOT NULL,
	"applies_to" text DEFAULT 'all' NOT NULL,
	"min_order_amount" integer,
	"usage_limit" integer,
	"usage_count" integer DEFAULT 0 NOT NULL,
	"usage_limit_per_customer" integer,
	"combines_with_other_promotions" boolean DEFAULT false NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"customer_group_id" integer,
	"starts_at" timestamp,
	"ends_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "promotions_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "related_products" (
	"product_id" integer NOT NULL,
	"related_product_id" integer NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "related_products_product_id_related_product_id_pk" PRIMARY KEY("product_id","related_product_id")
);
--> statement-breakpoint
CREATE TABLE "reviews" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" integer NOT NULL,
	"customer_id" integer NOT NULL,
	"nickname" varchar(100) NOT NULL,
	"rating" integer NOT NULL,
	"comment" text,
	"is_verified_purchase" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shipping_methods" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" varchar(100) NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "shipping_methods_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "stock_reservations" (
	"id" serial PRIMARY KEY NOT NULL,
	"variant_id" integer NOT NULL,
	"order_id" integer NOT NULL,
	"order_line_id" integer NOT NULL,
	"quantity" integer NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tax_rates" (
	"code" varchar(20) PRIMARY KEY NOT NULL,
	"rate" numeric(5, 4) NOT NULL,
	"name" varchar(100) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "variant_facet_values" (
	"variant_id" integer NOT NULL,
	"facet_value_id" integer NOT NULL,
	CONSTRAINT "variant_facet_values_variant_id_facet_value_id_pk" PRIMARY KEY("variant_id","facet_value_id")
);
--> statement-breakpoint
CREATE TABLE "wishlist_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"wishlist_id" integer NOT NULL,
	"product_id" integer NOT NULL,
	"variant_id" integer,
	"added_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wishlists" (
	"id" serial PRIMARY KEY NOT NULL,
	"customer_id" integer,
	"guest_token" varchar(64),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "wishlists_guest_token_unique" UNIQUE("guest_token")
);
--> statement-breakpoint
ALTER TABLE "addresses" ADD CONSTRAINT "addresses_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_featured_asset_id_assets_id_fk" FOREIGN KEY ("featured_asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "category_translations" ADD CONSTRAINT "category_translations_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_filters" ADD CONSTRAINT "collection_filters_collection_id_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."collections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_translations" ADD CONSTRAINT "collection_translations_collection_id_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."collections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collections" ADD CONSTRAINT "collections_featured_asset_id_assets_id_fk" FOREIGN KEY ("featured_asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_page_translations" ADD CONSTRAINT "content_page_translations_content_page_id_content_pages_id_fk" FOREIGN KEY ("content_page_id") REFERENCES "public"."content_pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_group_members" ADD CONSTRAINT "customer_group_members_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_group_members" ADD CONSTRAINT "customer_group_members_group_id_customer_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."customer_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facet_translations" ADD CONSTRAINT "facet_translations_facet_id_facets_id_fk" FOREIGN KEY ("facet_id") REFERENCES "public"."facets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facet_value_translations" ADD CONSTRAINT "facet_value_translations_facet_value_id_facet_values_id_fk" FOREIGN KEY ("facet_value_id") REFERENCES "public"."facet_values"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facet_values" ADD CONSTRAINT "facet_values_facet_id_facets_id_fk" FOREIGN KEY ("facet_id") REFERENCES "public"."facets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_promotions" ADD CONSTRAINT "order_promotions_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_promotions" ADD CONSTRAINT "order_promotions_promotion_id_promotions_id_fk" FOREIGN KEY ("promotion_id") REFERENCES "public"."promotions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_shipping" ADD CONSTRAINT "order_shipping_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_shipping" ADD CONSTRAINT "order_shipping_shipping_method_id_shipping_methods_id_fk" FOREIGN KEY ("shipping_method_id") REFERENCES "public"."shipping_methods"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_payment_method_id_payment_methods_id_fk" FOREIGN KEY ("payment_method_id") REFERENCES "public"."payment_methods"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_assets" ADD CONSTRAINT "product_assets_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_assets" ADD CONSTRAINT "product_assets_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_categories" ADD CONSTRAINT "product_categories_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_categories" ADD CONSTRAINT "product_categories_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_facet_values" ADD CONSTRAINT "product_facet_values_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_facet_values" ADD CONSTRAINT "product_facet_values_facet_value_id_facet_values_id_fk" FOREIGN KEY ("facet_value_id") REFERENCES "public"."facet_values"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_translations" ADD CONSTRAINT "product_translations_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_variant_assets" ADD CONSTRAINT "product_variant_assets_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_variant_assets" ADD CONSTRAINT "product_variant_assets_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_variant_group_prices" ADD CONSTRAINT "product_variant_group_prices_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_variant_translations" ADD CONSTRAINT "product_variant_translations_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotion_collections" ADD CONSTRAINT "promotion_collections_promotion_id_promotions_id_fk" FOREIGN KEY ("promotion_id") REFERENCES "public"."promotions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotion_collections" ADD CONSTRAINT "promotion_collections_collection_id_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."collections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotion_products" ADD CONSTRAINT "promotion_products_promotion_id_promotions_id_fk" FOREIGN KEY ("promotion_id") REFERENCES "public"."promotions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotion_products" ADD CONSTRAINT "promotion_products_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotions" ADD CONSTRAINT "promotions_customer_group_id_customer_groups_id_fk" FOREIGN KEY ("customer_group_id") REFERENCES "public"."customer_groups"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "related_products" ADD CONSTRAINT "related_products_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "related_products" ADD CONSTRAINT "related_products_related_product_id_products_id_fk" FOREIGN KEY ("related_product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_reservations" ADD CONSTRAINT "stock_reservations_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_reservations" ADD CONSTRAINT "stock_reservations_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_reservations" ADD CONSTRAINT "stock_reservations_order_line_id_order_lines_id_fk" FOREIGN KEY ("order_line_id") REFERENCES "public"."order_lines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variant_facet_values" ADD CONSTRAINT "variant_facet_values_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variant_facet_values" ADD CONSTRAINT "variant_facet_values_facet_value_id_facet_values_id_fk" FOREIGN KEY ("facet_value_id") REFERENCES "public"."facet_values"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wishlist_items" ADD CONSTRAINT "wishlist_items_wishlist_id_wishlists_id_fk" FOREIGN KEY ("wishlist_id") REFERENCES "public"."wishlists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wishlist_items" ADD CONSTRAINT "wishlist_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wishlist_items" ADD CONSTRAINT "wishlist_items_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wishlists" ADD CONSTRAINT "wishlists_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "addresses_customer_idx" ON "addresses" USING btree ("customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "categories_slug_idx" ON "categories" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "categories_parent_idx" ON "categories" USING btree ("parent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "category_translations_category_lang_idx" ON "category_translations" USING btree ("category_id","language_code");--> statement-breakpoint
CREATE INDEX "collection_filters_collection_idx" ON "collection_filters" USING btree ("collection_id");--> statement-breakpoint
CREATE UNIQUE INDEX "collection_translations_collection_lang_idx" ON "collection_translations" USING btree ("collection_id","language_code");--> statement-breakpoint
CREATE INDEX "collection_translations_slug_idx" ON "collection_translations" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "content_page_translations_page_lang_idx" ON "content_page_translations" USING btree ("content_page_id","language_code");--> statement-breakpoint
CREATE INDEX "content_page_translations_slug_idx" ON "content_page_translations" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "customer_group_members_customer_idx" ON "customer_group_members" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "customer_group_members_group_idx" ON "customer_group_members" USING btree ("group_id");--> statement-breakpoint
CREATE UNIQUE INDEX "customer_groups_code_idx" ON "customer_groups" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "customers_email_idx" ON "customers" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "customers_auth_user_id_idx" ON "customers" USING btree ("auth_user_id");--> statement-breakpoint
CREATE INDEX "customers_name_idx" ON "customers" USING btree ("first_name","last_name");--> statement-breakpoint
CREATE UNIQUE INDEX "facet_translations_facet_lang_idx" ON "facet_translations" USING btree ("facet_id","language_code");--> statement-breakpoint
CREATE UNIQUE INDEX "facet_value_translations_value_lang_idx" ON "facet_value_translations" USING btree ("facet_value_id","language_code");--> statement-breakpoint
CREATE UNIQUE INDEX "facet_values_facet_code_idx" ON "facet_values" USING btree ("facet_id","code");--> statement-breakpoint
CREATE INDEX "facet_values_facet_idx" ON "facet_values" USING btree ("facet_id");--> statement-breakpoint
CREATE INDEX "order_lines_order_idx" ON "order_lines" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "order_lines_variant_idx" ON "order_lines" USING btree ("variant_id");--> statement-breakpoint
CREATE INDEX "order_promotions_order_idx" ON "order_promotions" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "order_shipping_order_idx" ON "order_shipping" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "order_shipping_method_idx" ON "order_shipping" USING btree ("shipping_method_id");--> statement-breakpoint
CREATE INDEX "order_shipping_status_idx" ON "order_shipping" USING btree ("status");--> statement-breakpoint
CREATE INDEX "order_shipping_tracking_idx" ON "order_shipping" USING btree ("tracking_number");--> statement-breakpoint
CREATE INDEX "orders_customer_idx" ON "orders" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "orders_state_idx" ON "orders" USING btree ("state");--> statement-breakpoint
CREATE INDEX "orders_placed_at_idx" ON "orders" USING btree ("order_placed_at");--> statement-breakpoint
CREATE INDEX "orders_active_idx" ON "orders" USING btree ("active");--> statement-breakpoint
CREATE INDEX "orders_cart_token_idx" ON "orders" USING btree ("cart_token");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_methods_code_idx" ON "payment_methods" USING btree ("code");--> statement-breakpoint
CREATE INDEX "payment_methods_active_idx" ON "payment_methods" USING btree ("active");--> statement-breakpoint
CREATE INDEX "payments_order_idx" ON "payments" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "payments_method_idx" ON "payments" USING btree ("payment_method_id");--> statement-breakpoint
CREATE INDEX "payments_state_idx" ON "payments" USING btree ("state");--> statement-breakpoint
CREATE INDEX "payments_transaction_idx" ON "payments" USING btree ("transaction_id");--> statement-breakpoint
CREATE INDEX "product_assets_product_idx" ON "product_assets" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "product_categories_product_idx" ON "product_categories" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "product_categories_category_idx" ON "product_categories" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "product_facet_values_product_idx" ON "product_facet_values" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "product_facet_values_value_idx" ON "product_facet_values" USING btree ("facet_value_id");--> statement-breakpoint
CREATE UNIQUE INDEX "product_translations_product_lang_idx" ON "product_translations" USING btree ("product_id","language_code");--> statement-breakpoint
CREATE INDEX "product_translations_slug_idx" ON "product_translations" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "product_variant_assets_variant_idx" ON "product_variant_assets" USING btree ("variant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "variant_group_price_unique" ON "product_variant_group_prices" USING btree ("variant_id","group_id");--> statement-breakpoint
CREATE INDEX "variant_group_prices_variant_idx" ON "product_variant_group_prices" USING btree ("variant_id");--> statement-breakpoint
CREATE INDEX "variant_group_prices_group_idx" ON "product_variant_group_prices" USING btree ("group_id");--> statement-breakpoint
CREATE UNIQUE INDEX "product_variant_translations_variant_lang_idx" ON "product_variant_translations" USING btree ("variant_id","language_code");--> statement-breakpoint
CREATE UNIQUE INDEX "product_variants_sku_idx" ON "product_variants" USING btree ("sku");--> statement-breakpoint
CREATE INDEX "product_variants_product_idx" ON "product_variants" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "products_visibility_idx" ON "products" USING btree ("visibility");--> statement-breakpoint
CREATE INDEX "promotions_code_idx" ON "promotions" USING btree ("code");--> statement-breakpoint
CREATE INDEX "promotions_enabled_idx" ON "promotions" USING btree ("enabled");--> statement-breakpoint
CREATE INDEX "related_products_product_idx" ON "related_products" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "related_products_related_idx" ON "related_products" USING btree ("related_product_id");--> statement-breakpoint
CREATE INDEX "reviews_product_idx" ON "reviews" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "reviews_customer_idx" ON "reviews" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "reviews_status_idx" ON "reviews" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "reviews_product_customer_idx" ON "reviews" USING btree ("product_id","customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "shipping_methods_code_idx" ON "shipping_methods" USING btree ("code");--> statement-breakpoint
CREATE INDEX "shipping_methods_active_idx" ON "shipping_methods" USING btree ("active");--> statement-breakpoint
CREATE INDEX "stock_reservations_variant_idx" ON "stock_reservations" USING btree ("variant_id");--> statement-breakpoint
CREATE INDEX "stock_reservations_expires_idx" ON "stock_reservations" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "stock_reservations_order_idx" ON "stock_reservations" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "stock_reservations_line_idx" ON "stock_reservations" USING btree ("order_line_id");--> statement-breakpoint
CREATE INDEX "variant_facet_values_variant_idx" ON "variant_facet_values" USING btree ("variant_id");--> statement-breakpoint
CREATE INDEX "variant_facet_values_value_idx" ON "variant_facet_values" USING btree ("facet_value_id");--> statement-breakpoint
CREATE INDEX "wishlist_items_wishlist_idx" ON "wishlist_items" USING btree ("wishlist_id");--> statement-breakpoint
CREATE INDEX "wishlist_items_product_idx" ON "wishlist_items" USING btree ("product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "wishlist_items_wishlist_product_idx" ON "wishlist_items" USING btree ("wishlist_id","product_id");--> statement-breakpoint
CREATE INDEX "wishlists_customer_idx" ON "wishlists" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "wishlists_guest_token_idx" ON "wishlists" USING btree ("guest_token");