CREATE TABLE `opentavern_sync_v2_chunks` (
	`token_hash` text NOT NULL,
	`object_hash` text NOT NULL,
	`chunk_index` integer NOT NULL,
	`chunk_count` integer NOT NULL,
	`data` text NOT NULL,
	`chunk_hash` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`token_hash`, `object_hash`, `chunk_index`)
);
--> statement-breakpoint
CREATE TABLE `opentavern_sync_v2_locks` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`lock_id` text NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `opentavern_sync_v2_meta` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`manifest_hash` text NOT NULL,
	`manifest_chunks` integer NOT NULL,
	`manifest_bytes` integer NOT NULL,
	`revision` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`last_saved` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `opentavern_sync` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	`updated_at` integer NOT NULL
);
