CREATE TABLE `board_invites` (
	`token` text PRIMARY KEY NOT NULL,
	`board_id` text NOT NULL,
	`role` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`board_id`) REFERENCES `boards`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `board_invites_board_role_idx` ON `board_invites` (`board_id`,`role`);--> statement-breakpoint
CREATE TABLE `board_members` (
	`board_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	PRIMARY KEY(`board_id`, `user_id`),
	FOREIGN KEY (`board_id`) REFERENCES `boards`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `board_members_user_idx` ON `board_members` (`user_id`);--> statement-breakpoint
ALTER TABLE `decisions` ADD `closes_at` integer;--> statement-breakpoint
ALTER TABLE `decisions` ADD `closed_at` integer;--> statement-breakpoint
ALTER TABLE `decisions` ADD `hide_results` integer DEFAULT false NOT NULL;--> statement-breakpoint
-- Until now anyone with a board link could ask questions, so everyone who
-- already took part in a board keeps that ability as an editor.
INSERT OR IGNORE INTO `board_members` (`board_id`, `user_id`, `role`)
SELECT DISTINCT `d`.`board_id`, `d`.`created_by_id`, 'editor'
FROM `decisions` `d` JOIN `boards` `b` ON `b`.`id` = `d`.`board_id`
WHERE `d`.`created_by_id` != `b`.`owner_id`;--> statement-breakpoint
INSERT OR IGNORE INTO `board_members` (`board_id`, `user_id`, `role`)
SELECT DISTINCT `d`.`board_id`, `o`.`created_by_id`, 'editor'
FROM `options` `o`
JOIN `decisions` `d` ON `d`.`id` = `o`.`decision_id`
JOIN `boards` `b` ON `b`.`id` = `d`.`board_id`
WHERE `o`.`created_by_id` != `b`.`owner_id`;--> statement-breakpoint
INSERT OR IGNORE INTO `board_members` (`board_id`, `user_id`, `role`)
SELECT DISTINCT `d`.`board_id`, `v`.`user_id`, 'editor'
FROM `votes` `v`
JOIN `decisions` `d` ON `d`.`id` = `v`.`decision_id`
JOIN `boards` `b` ON `b`.`id` = `d`.`board_id`
WHERE `v`.`user_id` != `b`.`owner_id`;
