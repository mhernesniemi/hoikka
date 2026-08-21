ALTER TABLE `collections` ADD `custom_fields` text DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE `content_pages` ADD `template` text DEFAULT 'default' NOT NULL;--> statement-breakpoint
ALTER TABLE `content_pages` ADD `custom_fields` text DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE `products` ADD `custom_fields` text DEFAULT '{}' NOT NULL;