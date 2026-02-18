CREATE TABLE "asset_translations" (
	"id" serial PRIMARY KEY NOT NULL,
	"asset_id" integer NOT NULL,
	"language_code" varchar(10) NOT NULL,
	"alt" text
);
--> statement-breakpoint
ALTER TABLE "asset_translations" ADD CONSTRAINT "asset_translations_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "asset_translations_asset_lang_idx" ON "asset_translations" USING btree ("asset_id","language_code");