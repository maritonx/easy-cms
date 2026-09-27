-- Easy CMS migration 20260927093100_status_index (sqlite)
-- Generated from the config; review before deploying.
CREATE INDEX `ecms_posts_status_idx` ON `ecms_posts` (`status`);
