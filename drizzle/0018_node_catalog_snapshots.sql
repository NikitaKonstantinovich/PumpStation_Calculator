CREATE TABLE node_catalog_snapshots (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  header TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE node_catalog_chunks (
  snapshot_id TEXT NOT NULL REFERENCES node_catalog_snapshots(id),
  ordinal INTEGER NOT NULL CHECK(ordinal >= 0),
  payload TEXT NOT NULL,
  PRIMARY KEY(snapshot_id, ordinal)
);
CREATE TRIGGER node_catalog_snapshots_immutable_update BEFORE UPDATE ON node_catalog_snapshots
BEGIN SELECT RAISE(ABORT, 'Catalog snapshots are immutable'); END;
CREATE TRIGGER node_catalog_snapshots_immutable_delete BEFORE DELETE ON node_catalog_snapshots
BEGIN SELECT RAISE(ABORT, 'Catalog snapshots are immutable'); END;
CREATE TRIGGER node_catalog_chunks_immutable_update BEFORE UPDATE ON node_catalog_chunks
BEGIN SELECT RAISE(ABORT, 'Catalog snapshots are immutable'); END;
CREATE TRIGGER node_catalog_chunks_immutable_delete BEFORE DELETE ON node_catalog_chunks
BEGIN SELECT RAISE(ABORT, 'Catalog snapshots are immutable'); END;
