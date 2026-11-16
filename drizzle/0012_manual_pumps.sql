CREATE TABLE IF NOT EXISTS manual_pumps (
  id TEXT PRIMARY KEY NOT NULL,
  identity_key TEXT NOT NULL,
  pump_json TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  created_by TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_manual_pumps_identity ON manual_pumps(identity_key);
