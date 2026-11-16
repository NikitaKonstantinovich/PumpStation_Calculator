CREATE TABLE IF NOT EXISTS frame_catalog_versions (
  id TEXT PRIMARY KEY,
  payload TEXT NOT NULL,
  author TEXT NOT NULL,
  created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS frame_catalog_state (
  id INTEGER PRIMARY KEY CHECK(id=1),
  version TEXT,
  revision INTEGER NOT NULL DEFAULT 0
);
INSERT OR IGNORE INTO frame_catalog_state(id) VALUES(1);
CREATE TRIGGER IF NOT EXISTS frame_catalog_immutable BEFORE UPDATE ON frame_catalog_versions
BEGIN SELECT RAISE(ABORT,'immutable frame catalogue'); END;
CREATE TRIGGER IF NOT EXISTS frame_catalog_no_delete BEFORE DELETE ON frame_catalog_versions
BEGIN SELECT RAISE(ABORT,'immutable frame catalogue'); END;
