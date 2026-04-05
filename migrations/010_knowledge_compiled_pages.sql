CREATE TABLE knowledge_pages (
  id BIGSERIAL PRIMARY KEY,
  page_type TEXT NOT NULL
    CHECK (page_type IN ('scope_summary')),
  scope TEXT NOT NULL
    CHECK (scope IN ('owner', 'business', 'role', 'task', 'branch', 'program', 'competitor')),
  scope_id TEXT,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('draft', 'active', 'stale', 'archived')),
  current_version_id BIGINT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE knowledge_page_versions (
  id BIGSERIAL PRIMARY KEY,
  page_id BIGINT NOT NULL REFERENCES knowledge_pages(id) ON DELETE CASCADE,
  version_no INTEGER NOT NULL,
  summary_short TEXT,
  summary_full TEXT,
  key_facts_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  contradictions_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  open_questions_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  related_pages_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  compiled_markdown TEXT,
  compiled_by TEXT NOT NULL,
  change_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (page_id, version_no)
);

CREATE UNIQUE INDEX idx_knowledge_pages_scope_summary
  ON knowledge_pages (page_type, scope, COALESCE(scope_id, ''));

CREATE INDEX idx_knowledge_pages_scope_status_updated_at
  ON knowledge_pages (scope, scope_id, status, updated_at DESC);

CREATE INDEX idx_knowledge_page_versions_page_id_created_at
  ON knowledge_page_versions (page_id, created_at DESC);
