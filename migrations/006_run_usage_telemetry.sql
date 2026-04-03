BEGIN;

ALTER TABLE runs
  ADD COLUMN usage_json JSONB,
  ADD COLUMN prompt_tokens INTEGER,
  ADD COLUMN completion_tokens INTEGER,
  ADD COLUMN total_tokens INTEGER,
  ADD COLUMN response_cost_usd NUMERIC(12,8);

COMMIT;
