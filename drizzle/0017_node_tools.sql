CREATE TABLE IF NOT EXISTS node_tool_versions (
  id TEXT PRIMARY KEY,
  document TEXT NOT NULL,
  program TEXT NOT NULL,
  author TEXT NOT NULL,
  created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS node_tool_state (
  id INTEGER PRIMARY KEY CHECK(id=1),
  revision INTEGER NOT NULL DEFAULT 0,
  active TEXT REFERENCES node_tool_versions(id),
  draft TEXT
);
INSERT OR IGNORE INTO node_tool_state(id) VALUES (1);
CREATE TRIGGER IF NOT EXISTS node_tool_versions_immutable
BEFORE UPDATE ON node_tool_versions BEGIN SELECT RAISE(ABORT,'Published tools are immutable'); END;
