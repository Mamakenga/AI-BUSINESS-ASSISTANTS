BEGIN;

ALTER TABLE runs
  DROP CONSTRAINT IF EXISTS runs_requested_by_agent_check;

ALTER TABLE runs
  ADD CONSTRAINT runs_requested_by_agent_check
  CHECK (requested_by_agent IN ('founder', 'orchestrator', 'scheduler'));

COMMIT;
