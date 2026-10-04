ALTER TABLE `users` ADD `delivery_address` text;--> statement-breakpoint
ALTER TABLE `users` ADD `show_payments` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `show_phone` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `show_address` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `wishes` ADD `priority_level` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `wishes` ADD `currency` text DEFAULT 'UAH' NOT NULL;--> statement-breakpoint
ALTER TABLE `wishlist_shares` ADD `allow_indexing` integer DEFAULT true NOT NULL;--> statement-breakpoint
CREATE INDEX `wishes_owner_priority_level_index` ON `wishes` (`user_id`,`removed`,`priority_level`,`updated_at`);--> statement-breakpoint
UPDATE `wishes` SET `priority_level` = 3 WHERE `priority` = 1;--> statement-breakpoint
UPDATE `wishes` SET `currency` = COALESCE((SELECT `users`.`currency` FROM `users` WHERE `users`.`id` = `wishes`.`user_id`), 'UAH');