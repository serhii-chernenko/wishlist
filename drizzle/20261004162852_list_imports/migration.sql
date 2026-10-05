CREATE TABLE `list_imports` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`user_id` integer NOT NULL,
	`source` text NOT NULL,
	`kind` text NOT NULL,
	`channel` text NOT NULL,
	`state` text NOT NULL,
	`source_url` text,
	`visibility` text NOT NULL,
	`found` integer DEFAULT 0 NOT NULL,
	`planned` integer DEFAULT 0 NOT NULL,
	`planned_gifted` integer DEFAULT 0 NOT NULL,
	`duplicates` integer DEFAULT 0 NOT NULL,
	`over_limit` integer DEFAULT 0 NOT NULL,
	`without_price` integer DEFAULT 0 NOT NULL,
	`without_photo` integer DEFAULT 0 NOT NULL,
	`created` integer DEFAULT 0 NOT NULL,
	`created_gifted` integer DEFAULT 0 NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`failure` text,
	`chat_message_id` integer,
	`lease_until` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`finished_at` integer,
	CONSTRAINT `fk_list_imports_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
	CONSTRAINT "list_imports_source_check" CHECK("source" in ('rewish')),
	CONSTRAINT "list_imports_kind_check" CHECK("kind" in ('wishes', 'collection')),
	CONSTRAINT "list_imports_channel_check" CHECK("channel" in ('bot', 'app')),
	CONSTRAINT "list_imports_state_check" CHECK("state" in ('previewed', 'committing', 'done', 'failed', 'expired', 'cancelled')),
	CONSTRAINT "list_imports_visibility_check" CHECK("visibility" in ('hidden', 'public')),
	CONSTRAINT "list_imports_failure_check" CHECK("failure" is null or "failure" in ('invalidUrl', 'userNotFound', 'privateCollection', 'schemaChanged', 'upstream', 'timeout', 'rateLimited', 'empty', 'busy', 'limitReached', 'expired'))
);
--> statement-breakpoint
ALTER TABLE `wishes` ADD `source_ref` text;--> statement-breakpoint
ALTER TABLE `wishes` ADD `source_image_url` text;--> statement-breakpoint
CREATE INDEX `list_imports_user_state_index` ON `list_imports` (`user_id`,`state`);--> statement-breakpoint
CREATE UNIQUE INDEX `list_imports_one_active` ON `list_imports` (`user_id`) WHERE "list_imports"."state" = 'committing';--> statement-breakpoint
CREATE UNIQUE INDEX `wishes_owner_source_ref_unique` ON `wishes` (`user_id`,`source_ref`) WHERE "wishes"."source_ref" is not null;--> statement-breakpoint
CREATE INDEX `wishes_pending_photo_index` ON `wishes` (`user_id`,`id`) WHERE "wishes"."source_image_url" is not null;