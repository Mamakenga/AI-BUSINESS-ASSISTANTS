BEGIN;

CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'inbox'
    CHECK (status IN ('inbox', 'in_work', 'done')),
  assigned_role TEXT
    CHECK (
      assigned_role IS NULL OR assigned_role IN (
        'orchestrator',
        'assistant',
        'researcher',
        'methodist',
        'finance_analyst',
        'critic',
        'memory_curator'
      )
    ),
  priority TEXT NOT NULL DEFAULT 'medium'
    CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  due_at TIMESTAMPTZ,
  thread_id TEXT,
  board_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_tasks_status_board_order_created_at
  ON tasks (status, board_order, created_at DESC);

CREATE INDEX idx_tasks_assigned_role_status_updated_at
  ON tasks (assigned_role, status, updated_at DESC)
  WHERE assigned_role IS NOT NULL;

CREATE INDEX idx_tasks_thread_id
  ON tasks (thread_id)
  WHERE thread_id IS NOT NULL;

CREATE INDEX idx_tasks_due_at
  ON tasks (due_at)
  WHERE due_at IS NOT NULL;

ALTER TABLE messages
  ADD CONSTRAINT fk_messages_task_id
  FOREIGN KEY (task_id) REFERENCES tasks(id)
  ON DELETE SET NULL;

ALTER TABLE runs
  ADD CONSTRAINT fk_runs_task_id
  FOREIGN KEY (task_id) REFERENCES tasks(id)
  ON DELETE SET NULL;

ALTER TABLE artifacts
  ADD CONSTRAINT fk_artifacts_task_id
  FOREIGN KEY (task_id) REFERENCES tasks(id)
  ON DELETE RESTRICT;

COMMIT;
