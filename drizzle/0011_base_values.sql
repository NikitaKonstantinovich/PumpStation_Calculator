CREATE TABLE IF NOT EXISTS base_value_versions (
  id TEXT PRIMARY KEY NOT NULL,
  values_json TEXT NOT NULL,
  author TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS base_value_state (
  id INTEGER PRIMARY KEY CHECK (id=1),
  active_id TEXT NOT NULL REFERENCES base_value_versions(id),
  revision INTEGER NOT NULL DEFAULT 0,
  draft_json TEXT NOT NULL,
  draft_author TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TRIGGER IF NOT EXISTS base_versions_immutable_update BEFORE UPDATE ON base_value_versions BEGIN SELECT RAISE(ABORT, 'Published base values are immutable'); END;
CREATE TRIGGER IF NOT EXISTS base_versions_immutable_delete BEFORE DELETE ON base_value_versions BEGIN SELECT RAISE(ABORT, 'Published base values are immutable'); END;
