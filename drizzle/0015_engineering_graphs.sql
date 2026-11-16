CREATE TABLE IF NOT EXISTS engineering_versions (
  id TEXT PRIMARY KEY, document TEXT, program TEXT NOT NULL, author TEXT NOT NULL,
  created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS engineering_state (
  id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL DEFAULT 0,
  active TEXT NOT NULL REFERENCES engineering_versions(id), draft TEXT
);
INSERT OR IGNORE INTO engineering_versions(id,program,author)
VALUES ('engineering-v1','{"version":"engineering-v1","plans":{},"args":{}}','Начальная версия');
INSERT OR IGNORE INTO engineering_state(id,active) VALUES (1,'engineering-v1');
