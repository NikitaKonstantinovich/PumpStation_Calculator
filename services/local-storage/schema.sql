CREATE TABLE IF NOT EXISTS projects (
  id text PRIMARY KEY, owner_id text NOT NULL, name text NOT NULL,
  head integer NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz
);
CREATE INDEX IF NOT EXISTS projects_owner_recent ON projects(owner_id, updated_at DESC, id);
CREATE TABLE IF NOT EXISTS project_revisions (
  project_id text REFERENCES projects(id) ON DELETE CASCADE,
  revision integer NOT NULL, author_id text NOT NULL, kind text NOT NULL,
  format integer NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  pinned boolean NOT NULL DEFAULT false, config jsonb NOT NULL,
  PRIMARY KEY(project_id, revision)
);
CREATE TABLE IF NOT EXISTS project_save_receipts (
  project_id text REFERENCES projects(id) ON DELETE CASCADE, operation uuid NOT NULL,
  digest text NOT NULL, revision integer NOT NULL, PRIMARY KEY(project_id,operation)
);
CREATE TABLE IF NOT EXISTS model_versions (
  model_id text NOT NULL, version text NOT NULL, mesh_path text, mesh_hash text,
  source_path text, source_hash text, units text NOT NULL, ports jsonb NOT NULL,
  profile jsonb NOT NULL, PRIMARY KEY(model_id,version)
);
CREATE TABLE IF NOT EXISTS model_releases (version text PRIMARY KEY, published_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE project_revisions ADD COLUMN IF NOT EXISTS model_release text REFERENCES model_releases(version);
CREATE TABLE IF NOT EXISTS calculation_jobs (
  id uuid PRIMARY KEY, owner_id text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  state text NOT NULL DEFAULT 'queued', attempts integer NOT NULL DEFAULT 0,
  progress integer NOT NULL DEFAULT 0, catalog_version text NOT NULL,
  payload jsonb, result jsonb, error text
);
CREATE INDEX IF NOT EXISTS calculation_queue ON calculation_jobs(created_at) WHERE state='queued';
