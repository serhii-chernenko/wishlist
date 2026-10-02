CREATE TABLE `wishlist_shares` (
	`user_id` integer PRIMARY KEY,
	`public_id` text NOT NULL,
	`display_name` text,
	`revoked_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_wishlist_shares_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX `wishes_share_fingerprint_index` ON `wishes` (`user_id`,`removed`,`hidden`,`updated_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `wishlist_shares_public_id_unique` ON `wishlist_shares` (`public_id`);