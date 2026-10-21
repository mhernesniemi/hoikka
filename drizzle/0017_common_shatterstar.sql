ALTER TABLE `user` ADD `last_sign_in_at` integer;--> statement-breakpoint
UPDATE `user` SET `last_sign_in_at` = (SELECT max(`created_at`) FROM `session` WHERE `session`.`user_id` = `user`.`id`);
