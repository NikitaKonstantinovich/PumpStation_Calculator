-- Existing node publications are mapped lazily, with a transactional backup, by initializeAlgorithms.
CREATE TABLE IF NOT EXISTS node_algorithms (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, name_key TEXT NOT NULL UNIQUE,
    connected INTEGER NOT NULL DEFAULT 0 CHECK(connected IN (0,1)),
    revision INTEGER NOT NULL DEFAULT 0, active TEXT REFERENCES node_tool_versions(id),
    next_number INTEGER NOT NULL DEFAULT 1, draft TEXT, draft_dirty INTEGER NOT NULL DEFAULT 0,
    created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);

CREATE TABLE IF NOT EXISTS node_algorithm_versions (
    id TEXT PRIMARY KEY REFERENCES node_tool_versions(id), algorithm_id TEXT NOT NULL REFERENCES node_algorithms(id),
    number INTEGER NOT NULL, reason TEXT NOT NULL, source_algorithm TEXT, source_version TEXT,
    UNIQUE(algorithm_id,number));

CREATE TRIGGER IF NOT EXISTS node_algorithm_versions_immutable BEFORE UPDATE ON node_algorithm_versions
    BEGIN SELECT RAISE(ABORT,'Algorithm versions are immutable'); END;

CREATE TABLE IF NOT EXISTS node_algorithm_migration_backup (
    id INTEGER PRIMARY KEY, revision INTEGER NOT NULL, active TEXT, draft TEXT, created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);

CREATE TABLE IF NOT EXISTS node_algorithm_legacy_versions_backup (
    id TEXT PRIMARY KEY, document TEXT NOT NULL, program TEXT NOT NULL, author TEXT NOT NULL, created TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS node_algorithm_draft_backups (
    id TEXT PRIMARY KEY, algorithm_id TEXT NOT NULL, revision INTEGER NOT NULL, document TEXT NOT NULL,
    created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
