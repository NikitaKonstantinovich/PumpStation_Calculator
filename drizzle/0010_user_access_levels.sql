-- Preserve existing users' access without rebuilding the users table or its foreign keys.
ALTER TABLE users ADD COLUMN access_level TEXT NOT NULL DEFAULT 'base' CHECK(access_level IN ('base','plus','pro'));
--> statement-breakpoint
UPDATE users SET access_level='pro' WHERE role='user';
