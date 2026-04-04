BEGIN;

CREATE TABLE IF NOT EXISTS role_catalog (
  role_id TEXT PRIMARY KEY,
  founder_entry_mode TEXT NOT NULL,
  execution_mode TEXT NOT NULL,
  task_assignable BOOLEAN NOT NULL DEFAULT TRUE,
  dispatchable BOOLEAN NOT NULL DEFAULT TRUE,
  founder_visible BOOLEAN NOT NULL DEFAULT TRUE,
  telegram_topic TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO role_catalog (
  role_id,
  founder_entry_mode,
  execution_mode,
  task_assignable,
  dispatchable,
  founder_visible,
  telegram_topic
)
VALUES
  ('orchestrator', 'direct_or_topic', 'multi_role_router', TRUE, FALSE, TRUE, '00 Orchestrator'),
  ('assistant', 'direct_or_topic', 'single_role_worker', TRUE, TRUE, TRUE, '01 Assistant'),
  ('researcher', 'direct_or_topic', 'single_role_worker', TRUE, TRUE, TRUE, '02 Researcher'),
  ('methodist', 'direct_or_topic', 'single_role_worker', TRUE, TRUE, TRUE, '03 Methodist'),
  ('finance_analyst', 'direct_or_topic', 'single_role_worker', TRUE, TRUE, TRUE, '04 Finance'),
  ('critic', 'direct_or_topic', 'review_worker', TRUE, TRUE, TRUE, '05 Critic'),
  ('memory_curator', 'service_only', 'memory_service', TRUE, FALSE, FALSE, NULL)
ON CONFLICT (role_id) DO NOTHING;

DO $$
DECLARE
  invalid_tasks TEXT;
  invalid_jobs TEXT;
  invalid_runs TEXT;
BEGIN
  SELECT string_agg(DISTINCT assigned_role, ', ' ORDER BY assigned_role)
  INTO invalid_tasks
  FROM tasks
  WHERE assigned_role IS NOT NULL
    AND assigned_role NOT IN (SELECT role_id FROM role_catalog);

  IF invalid_tasks IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot add role_catalog FK for tasks.assigned_role. Invalid roles: %', invalid_tasks;
  END IF;

  SELECT string_agg(DISTINCT assigned_agent, ', ' ORDER BY assigned_agent)
  INTO invalid_jobs
  FROM jobs
  WHERE assigned_agent NOT IN (SELECT role_id FROM role_catalog);

  IF invalid_jobs IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot add role_catalog FK for jobs.assigned_agent. Invalid roles: %', invalid_jobs;
  END IF;

  SELECT string_agg(DISTINCT agent, ', ' ORDER BY agent)
  INTO invalid_runs
  FROM runs
  WHERE agent NOT IN (SELECT role_id FROM role_catalog);

  IF invalid_runs IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot add role_catalog FK for runs.agent. Invalid roles: %', invalid_runs;
  END IF;
END $$;

ALTER TABLE tasks
  DROP CONSTRAINT IF EXISTS tasks_assigned_role_check;

ALTER TABLE tasks
  DROP CONSTRAINT IF EXISTS fk_tasks_assigned_role;

ALTER TABLE tasks
  ADD CONSTRAINT fk_tasks_assigned_role
  FOREIGN KEY (assigned_role) REFERENCES role_catalog(role_id)
  ON DELETE RESTRICT;

ALTER TABLE jobs
  DROP CONSTRAINT IF EXISTS fk_jobs_assigned_agent;

ALTER TABLE jobs
  ADD CONSTRAINT fk_jobs_assigned_agent
  FOREIGN KEY (assigned_agent) REFERENCES role_catalog(role_id)
  ON DELETE RESTRICT;

ALTER TABLE runs
  DROP CONSTRAINT IF EXISTS fk_runs_agent;

ALTER TABLE runs
  ADD CONSTRAINT fk_runs_agent
  FOREIGN KEY (agent) REFERENCES role_catalog(role_id)
  ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_role_catalog_dispatchable
  ON role_catalog (dispatchable, founder_visible, task_assignable);

COMMIT;
