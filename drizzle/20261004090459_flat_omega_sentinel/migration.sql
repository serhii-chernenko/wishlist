ALTER TABLE `users` ADD `show_gifted` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `wishes` ADD `gifted_hidden` integer DEFAULT false NOT NULL;