CREATE TABLE `bookmarks` (
  `id` text PRIMARY KEY NOT NULL,
  `url` text NOT NULL,
  `normalized_url` text NOT NULL,
  `final_url` text NOT NULL,
  `title` text NOT NULL,
  `domain` text NOT NULL,
  `description` text,
  `author` text,
  `favicon_url` text,
  `cover_image_url` text,
  `markdown_content` text DEFAULT '' NOT NULL,
  `plain_text` text DEFAULT '' NOT NULL,
  `user_note` text DEFAULT '' NOT NULL,
  `extraction_status` text DEFAULT 'pending' NOT NULL
    CHECK (`extraction_status` IN ('pending', 'success', 'partial', 'failed')),
  `error_code` text,
  `error_message` text,
  `http_status_code` integer,
  `content_length` integer DEFAULT 0 NOT NULL,
  `is_content_edited` integer DEFAULT 0 NOT NULL,
  `retry_count` integer DEFAULT 0 NOT NULL,
  `extracted_at` integer,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bookmarks_normalized_url_unique`
  ON `bookmarks` (`normalized_url`);
--> statement-breakpoint
CREATE INDEX `bookmarks_created_at_idx` ON `bookmarks` (`created_at`);
--> statement-breakpoint
CREATE INDEX `bookmarks_updated_at_idx` ON `bookmarks` (`updated_at`);
--> statement-breakpoint
CREATE INDEX `bookmarks_status_idx` ON `bookmarks` (`extraction_status`);
--> statement-breakpoint
CREATE INDEX `bookmarks_domain_idx` ON `bookmarks` (`domain`);
--> statement-breakpoint
CREATE TABLE `tags` (
  `id` text PRIMARY KEY NOT NULL,
  `name` text NOT NULL,
  `normalized_name` text NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tags_normalized_name_unique` ON `tags` (`normalized_name`);
--> statement-breakpoint
CREATE TABLE `bookmark_tags` (
  `bookmark_id` text NOT NULL,
  `tag_id` text NOT NULL,
  `created_at` integer NOT NULL,
  PRIMARY KEY (`bookmark_id`, `tag_id`),
  FOREIGN KEY (`bookmark_id`) REFERENCES `bookmarks` (`id`)
    ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`tag_id`) REFERENCES `tags` (`id`)
    ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `bookmark_tags_tag_idx` ON `bookmark_tags` (`tag_id`);
