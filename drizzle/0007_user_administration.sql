ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('admin','user'));
--> statement-breakpoint
ALTER TABLE users ADD COLUMN revision INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE sessions ADD COLUMN last_seen_at TEXT;
