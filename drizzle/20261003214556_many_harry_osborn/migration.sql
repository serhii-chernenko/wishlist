ALTER TABLE `users` ADD `last_bot_seen_at` integer;--> statement-breakpoint
ALTER TABLE `users` ADD `last_app_seen_at` integer;--> statement-breakpoint
UPDATE `users` SET `last_bot_seen_at` = `last_seen_at` WHERE `last_seen_at` IS NOT NULL;