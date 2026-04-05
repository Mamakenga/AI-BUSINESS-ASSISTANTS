CREATE TABLE knowledge_claims (
  id BIGSERIAL PRIMARY KEY,
  claim_text TEXT NOT NULL,
  claim_type TEXT NOT NULL
    CHECK (claim_type IN ('fact', 'pattern', 'risk', 'preference', 'hypothesis', 'decision_projection')),
  scope TEXT NOT NULL
    CHECK (scope IN ('owner', 'business', 'role', 'task', 'branch', 'program', 'competitor')),
  scope_id TEXT,
  status TEXT NOT NULL DEFAULT 'candidate'
    CHECK (status IN ('candidate', 'supported', 'disputed', 'superseded', 'archived')),
  confidence NUMERIC(4,3),
  freshness_score NUMERIC(4,3),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_reviewed_at TIMESTAMPTZ
);

CREATE TABLE knowledge_claim_sources (
  id BIGSERIAL PRIMARY KEY,
  claim_id BIGINT NOT NULL REFERENCES knowledge_claims(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL
    CHECK (source_type IN ('memory', 'decision', 'artifact', 'message', 'run')),
  source_id TEXT NOT NULL,
  support_type TEXT NOT NULL DEFAULT 'supports'
    CHECK (support_type IN ('supports', 'contradicts', 'derived_from')),
  evidence_snippet TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE knowledge_dirty_queue (
  id BIGSERIAL PRIMARY KEY,
  source_type TEXT NOT NULL
    CHECK (source_type IN ('memory', 'decision', 'artifact', 'message', 'run')),
  source_id TEXT NOT NULL,
  affected_scope TEXT
    CHECK (affected_scope IN ('owner', 'business', 'role', 'task', 'branch', 'program', 'competitor')),
  affected_scope_id TEXT,
  affected_node_slugs_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  reason TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 100,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  locked_at TIMESTAMPTZ
);

CREATE INDEX idx_knowledge_claims_scope_status_updated_at
  ON knowledge_claims (scope, scope_id, status, updated_at DESC);

CREATE INDEX idx_knowledge_claim_sources_claim_id
  ON knowledge_claim_sources (claim_id, created_at DESC);

CREATE INDEX idx_knowledge_claim_sources_source_ref
  ON knowledge_claim_sources (source_type, source_id);

CREATE INDEX idx_knowledge_dirty_queue_status_priority_created_at
  ON knowledge_dirty_queue (status, priority, created_at ASC);
