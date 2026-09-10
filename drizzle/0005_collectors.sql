CREATE TABLE `collector_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`collector_id` text NOT NULL,
	`role` text NOT NULL,
	`component_source_id` text,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`quantity` real NOT NULL,
	`unit` text NOT NULL,
	`unit_price_microunits` integer NOT NULL,
	`cost_microunits` integer NOT NULL,
	`source` text,
	`sort_order` integer NOT NULL,
	FOREIGN KEY (`collector_id`) REFERENCES `collectors`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_collector_items_role` ON `collector_items` (`collector_id`,`role`);--> statement-breakpoint
CREATE TABLE `collectors` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`type` text NOT NULL,
	`configuration_json` text NOT NULL,
	`calculation_json` text NOT NULL,
	`cached_price_microunits` integer NOT NULL,
	`weld_length_mm` real NOT NULL,
	`weld_cost_microunits` integer NOT NULL,
	`source` text NOT NULL,
	`created_by_user_id` text,
	`price_updated_at` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "ck_collectors_price" CHECK("collectors"."cached_price_microunits" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_collectors_code` ON `collectors` (`code`);--> statement-breakpoint
