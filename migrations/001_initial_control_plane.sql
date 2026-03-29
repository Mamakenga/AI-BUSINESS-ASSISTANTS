BEGIN;

CREATE TABLE memories (
  id BIGSERIAL PRIMARY KEY,
  scope TEXT NOT NULL CHECK (scope IN ('owner', 'business', 'role', 'task')),
  scope_id TEXT,
  fact TEXT NOT NULL,
  source TEXT,
  confidence NUMERIC(4,3) CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE messages (
  id BIGSERIAL PRIMARY KEY,
  thread_id TEXT NOT NULL,
  task_id TEXT,
  from_agent TEXT NOT NULL,
  to_agent TEXT NOT NULL,
  message_type TEXT NOT NULL DEFAULT 'handoff'
    CHECK (message_type IN ('handoff', 'request', 'note', 'alert')),
  content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'unread'
    CHECK (status IN ('unread', 'read', 'archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE decisions (
  id BIGSERIAL PRIMARY KEY,
  scope TEXT NOT NULL DEFAULT 'business'
    CHECK (scope IN ('business', 'owner', 'task')),
  decision TEXT NOT NULL,
  reasoning TEXT,
  made_by TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'superseded', 'archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE jobs (
  id BIGSERIAL PRIMARY KEY,
  job_type TEXT NOT NULL,
  assigned_agent TEXT NOT NULL,
  schedule TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  last_run_at TIMESTAMPTZ,
  next_run_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE runs (
  id BIGSERIAL PRIMARY KEY,
  agent TEXT NOT NULL,
  task_id TEXT,
  thread_id TEXT,
  status TEXT NOT NULL
    CHECK (status IN ('pending', 'running', 'completed', 'failed', 'canceled')),
  model_used TEXT,
  fallback_chain JSONB NOT NULL DEFAULT '[]'::jsonb,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE artifacts (
  id BIGSERIAL PRIMARY KEY,
  task_id TEXT NOT NULL,
  artifact_type TEXT NOT NULL,
  created_by TEXT NOT NULL,
  content JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_memories_scope_scope_id_created_at
  ON memories (scope, scope_id, created_at DESC);

CREATE INDEX idx_memories_expires_at
  ON memories (expires_at)
  WHERE expires_at IS NOT NULL;

CREATE INDEX idx_messages_thread_id_created_at
  ON messages (thread_id, created_at DESC);

CREATE INDEX idx_messages_task_id_created_at
  ON messages (task_id, created_at DESC)
  WHERE task_id IS NOT NULL;

CREATE INDEX idx_messages_to_agent_status_created_at
  ON messages (to_agent, status, created_at DESC);

CREATE INDEX idx_decisions_scope_status_created_at
  ON decisions (scope, status, created_at DESC);

CREATE INDEX idx_jobs_assigned_agent_enabled_next_run_at
  ON jobs (assigned_agent, enabled, next_run_at);

CREATE INDEX idx_runs_status_created_at
  ON runs (status, created_at DESC);

CREATE INDEX idx_runs_thread_id_created_at
  ON runs (thread_id, created_at DESC)
  WHERE thread_id IS NOT NULL;

CREATE INDEX idx_runs_task_id_created_at
  ON runs (task_id, created_at DESC)
  WHERE task_id IS NOT NULL;

CREATE INDEX idx_artifacts_task_id_created_at
  ON artifacts (task_id, created_at DESC);

CREATE INDEX idx_artifacts_type_created_at
  ON artifacts (artifact_type, created_at DESC);

COMMIT;
