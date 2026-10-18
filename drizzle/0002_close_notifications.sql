CREATE TABLE `notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`board_id` text NOT NULL,
	`decision_id` text NOT NULL,
	`kind` text NOT NULL,
	`closed_at` integer NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`read_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`board_id`) REFERENCES `boards`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`decision_id`) REFERENCES `decisions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `notifications_event_idx` ON `notifications` (`user_id`,`decision_id`,`kind`,`closed_at`);--> statement-breakpoint
CREATE INDEX `notifications_user_created_idx` ON `notifications` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `notifications_decision_idx` ON `notifications` (`decision_id`);--> statement-breakpoint
CREATE INDEX `notifications_board_idx` ON `notifications` (`board_id`);--> statement-breakpoint
ALTER TABLE `decisions` ADD `notified_close_at` integer;--> statement-breakpoint
-- Questions that closed before notifications existed count as notified, so
-- the first alarm after deploying doesn't announce old news.
UPDATE `decisions` SET `notified_close_at` = coalesce(`closed_at`, `closes_at`)
WHERE `closed_at` IS NOT NULL
OR `closes_at` <= cast(unixepoch('subsecond') * 1000 as integer);
