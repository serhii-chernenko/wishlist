CREATE TABLE `exchange_rates` (
	`currency` text PRIMARY KEY,
	`uah_per_unit` real NOT NULL,
	`rate_date` text NOT NULL,
	`fetched_at` integer NOT NULL
);
