ALTER TABLE decisions
ADD COLUMN IF NOT EXISTS scope_id TEXT;

DROP INDEX IF EXISTS idx_decisions_scope_status_created_at;

CREATE INDEX IF NOT EXISTS idx_decisions_scope_scope_id_status_created_at
  ON decisions (scope, scope_id, status, created_at DESC);
