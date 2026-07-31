ALTER TABLE `bookmarks` ADD `deleted_at` integer;--> statement-breakpoint
CREATE INDEX `bookmarks_deleted_at_idx` ON `bookmarks` (`deleted_at`);
