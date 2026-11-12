CREATE TABLE `episode_archives` (
	`episode_key` text PRIMARY KEY NOT NULL,
	`podcast_key` text,
	`podcast_title` text DEFAULT '' NOT NULL,
	`episode_title` text NOT NULL,
	`origin_url` text NOT NULL,
	`artwork_url` text,
	`duration_sec` integer,
	`size_bytes` integer DEFAULT 0 NOT NULL,
	`blob_key` text NOT NULL,
	`created_at` integer NOT NULL
);
