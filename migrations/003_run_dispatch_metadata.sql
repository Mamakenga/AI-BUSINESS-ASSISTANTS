BEGIN;

ALTER TABLE runs
  ADD COLUMN requested_by_agent TEXT NOT NULL DEFAULT 'founder'
    CHECK (requested_by_agent IN ('founder', 'orchestrator')),
  ADD COLUMN dispatch_reason TEXT;

CREATE INDEX idx_runs_requested_by_agent_status_created_at
  ON runs (requested_by_agent, status, created_at DESC);

COMMIT;
