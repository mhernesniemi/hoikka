CREATE TABLE "product_search" (
	"product_id" integer PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"slug" varchar(255) NOT NULL,
	"description" text,
	"visibility" text NOT NULL,
	"min_price" integer,
	"in_stock" boolean DEFAULT false NOT NULL,
	"featured_asset" jsonb,
	"facets" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"search_vector" "tsvector",
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "product_search" ADD CONSTRAINT "product_search_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "product_search_vector_idx" ON "product_search" USING gin ("search_vector");--> statement-breakpoint
CREATE INDEX "product_search_facets_idx" ON "product_search" USING gin ("facets");--> statement-breakpoint
CREATE INDEX "product_search_visibility_idx" ON "product_search" USING btree ("visibility");