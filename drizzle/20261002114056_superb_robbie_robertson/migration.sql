CREATE TABLE `gives` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`mongo_id` text,
	`user_id` integer NOT NULL,
	`wish_id` integer NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT `fk_gives_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_gives_wish_id_wishes_id_fk` FOREIGN KEY (`wish_id`) REFERENCES `wishes`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `release_announcements` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`release_version` text NOT NULL,
	`user_id` integer NOT NULL,
	`status` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`last_error_code` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_release_announcements_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
	CONSTRAINT "release_announcements_status_check" CHECK("status" in ('queued', 'sending', 'sent', 'skipped', 'failed'))
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`telegram_user_id` integer PRIMARY KEY,
	`language` text,
	`state` text DEFAULT '{"v":1}' NOT NULL,
	`media_group_id` text,
	`media_group_marker` integer,
	`updated_at` integer NOT NULL,
	CONSTRAINT "sessions_language_check" CHECK("language" is null or "language" in ('uk', 'en', 'pl'))
);
--> statement-breakpoint
CREATE TABLE `telegram_updates` (
	`bot_key` text NOT NULL,
	`update_id` integer NOT NULL,
	`status` text NOT NULL,
	`lease_id` text NOT NULL,
	`started_at` integer NOT NULL,
	`processed_at` integer,
	CONSTRAINT "telegram_updates_status_check" CHECK("status" in ('processing', 'processed'))
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`mongo_id` text,
	`telegram_id` integer NOT NULL,
	`username` text,
	`username_searchable` integer DEFAULT false NOT NULL,
	`phone` text,
	`phone_digits` text,
	`language` text,
	`telegram_language_code` text,
	`currency` text DEFAULT 'UAH' NOT NULL,
	`telegraph_access_token` text,
	`payments` text,
	`wishlist_filter` integer,
	`release_version` text DEFAULT '0.0.0' NOT NULL,
	`blocked_at` integer,
	`last_seen_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "users_language_check" CHECK("language" is null or "language" in ('uk', 'en', 'pl')),
	CONSTRAINT "users_wishlist_filter_check" CHECK("wishlist_filter" is null or "wishlist_filter" between 0 and 4)
);
--> statement-breakpoint
CREATE TABLE `wishes` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`mongo_id` text,
	`user_id` integer,
	`title` text NOT NULL,
	`description` text,
	`link` text,
	`images` text DEFAULT '[]' NOT NULL,
	`priority` integer DEFAULT false NOT NULL,
	`hidden` integer DEFAULT false NOT NULL,
	`removed` integer DEFAULT false NOT NULL,
	`done` integer DEFAULT false NOT NULL,
	`price` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_wishes_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL,
	CONSTRAINT "wishes_price_check" CHECK("price" >= 0),
	CONSTRAINT "wishes_images_check" CHECK(json_valid("images") and json_array_length("images") <= 9)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `gives_mongo_id_unique` ON `gives` (`mongo_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `gives_user_wish_unique` ON `gives` (`user_id`,`wish_id`);--> statement-breakpoint
CREATE INDEX `gives_wish_index` ON `gives` (`wish_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `release_announcements_version_user_unique` ON `release_announcements` (`release_version`,`user_id`);--> statement-breakpoint
CREATE INDEX `release_announcements_user_id_index` ON `release_announcements` (`user_id`);--> statement-breakpoint
CREATE INDEX `sessions_updated_at_index` ON `sessions` (`updated_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `telegram_updates_bot_update_unique` ON `telegram_updates` (`bot_key`,`update_id`);--> statement-breakpoint
CREATE INDEX `telegram_updates_cleanup_index` ON `telegram_updates` (`status`,`processed_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_mongo_id_unique` ON `users` (`mongo_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_telegram_id_unique` ON `users` (`telegram_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_phone_unique` ON `users` (`phone`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_lower_unique` ON `users` (lower("username"));--> statement-breakpoint
CREATE INDEX `users_phone_digits_index` ON `users` (`phone_digits`);--> statement-breakpoint
CREATE INDEX `users_release_index` ON `users` (`blocked_at`,`release_version`);--> statement-breakpoint
CREATE UNIQUE INDEX `wishes_mongo_id_unique` ON `wishes` (`mongo_id`);--> statement-breakpoint
CREATE INDEX `wishes_owner_list_index` ON `wishes` (`user_id`,`removed`,`priority`,`updated_at`);--> statement-breakpoint
CREATE INDEX `wishes_done_index` ON `wishes` (`done`);