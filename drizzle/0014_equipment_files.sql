CREATE TABLE IF NOT EXISTS equipment_files (
  equipment_key TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('drawing','model')),
  file_id TEXT NOT NULL REFERENCES manual_pump_files(id),
  updated_by TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (equipment_key,kind)
);
