CREATE TABLE IF NOT EXISTS component_insertions (
  id TEXT PRIMARY KEY NOT NULL,
  identity_key TEXT NOT NULL,
  name TEXT NOT NULL,
  configuration_json TEXT NOT NULL,
  calculation_json TEXT NOT NULL,
  catalog_version TEXT NOT NULL,
  cached_price_microunits INTEGER NOT NULL CHECK (cached_price_microunits > 0),
  base_length_mm REAL NOT NULL CHECK (base_length_mm > 0),
  total_length_mm REAL NOT NULL CHECK (total_length_mm > 0),
  weld_length_mm REAL NOT NULL CHECK (weld_length_mm >= 0),
  weld_cost_microunits INTEGER NOT NULL CHECK (weld_cost_microunits >= 0),
  revision INTEGER NOT NULL DEFAULT 0,
  created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  price_updated_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS uq_component_insertions_identity ON component_insertions(identity_key);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS component_insertion_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  insertion_id TEXT NOT NULL REFERENCES component_insertions(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL,
  item_json TEXT NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS uq_component_insertion_items_order ON component_insertion_items(insertion_id,sort_order);
