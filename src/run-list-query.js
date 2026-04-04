"use strict";

const ALLOWED_RUN_STATUSES = new Set(["pending", "completed", "failed", "canceled"]);

function normalizeOptionalString(value) {
  if (value === undefined || value === null) {
    return null;
  }
  const normalized = String(value).trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeBooleanFlag(value) {
  if (value === undefined || value === null || value === "") {
    return false;
  }

  const normalized = String(value).trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

function normalizeLimit(value, fallback = 50, max = 200) {
  const parsed = Number.parseInt(value || "", 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.min(parsed, max);
}

function normalizeRunStatus(value) {
  const normalized = normalizeOptionalString(value);
  if (!normalized) {
    return null;
  }
  if (!ALLOWED_RUN_STATUSES.has(normalized)) {
    throw new Error("Invalid run status");
  }
  return normalized;
}

function buildRunsListQuery(query = {}) {
  const values = [];
  const where = [];

  const status = normalizeRunStatus(query.status);
  if (status) {
    values.push(status);
    where.push(`status = $${values.length}`);
  }

  const agent = normalizeOptionalString(query.agent);
  if (agent) {
    values.push(agent);
    where.push(`agent = $${values.length}`);
  }

  const requestedByAgent = normalizeOptionalString(query.requested_by_agent);
  if (requestedByAgent) {
    values.push(requestedByAgent);
    where.push(`requested_by_agent = $${values.length}`);
  }

  const fallbackOnly = normalizeBooleanFlag(query.fallback_only);
  if (fallbackOnly) {
    where.push(`jsonb_array_length(COALESCE(fallback_chain, '[]'::jsonb)) > 0`);
  }

  const fallbackMarker = normalizeOptionalString(query.fallback_marker);
  if (fallbackMarker) {
    values.push(fallbackMarker);
    where.push(`COALESCE(fallback_chain, '[]'::jsonb) ? $${values.length}`);
  }

  const limit = normalizeLimit(query.limit, 50, 200);
  values.push(limit);

  return {
    filters: {
      status,
      agent,
      requested_by_agent: requestedByAgent,
      fallback_only: fallbackOnly,
      fallback_marker: fallbackMarker,
      limit,
    },
    sql: `
      SELECT id, agent, task_id, thread_id, status, requested_by_agent, dispatch_reason, model_used, fallback_chain, usage_json, prompt_tokens, completion_tokens, total_tokens, response_cost_usd, started_at, finished_at, created_at
      FROM runs
      ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY created_at DESC
      LIMIT $${values.length}
    `,
    values,
  };
}

module.exports = {
  ALLOWED_RUN_STATUSES,
  buildRunsListQuery,
};
