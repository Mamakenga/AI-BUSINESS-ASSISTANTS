"use strict";

function normalizeOptionalNumber(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const parsed = Number.parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : null;
}

function mapRunRow(row) {
  const fallbackChain = Array.isArray(row.fallback_chain) ? row.fallback_chain : [];

  return {
    id: row.id,
    agent: row.agent,
    task_id: row.task_id,
    thread_id: row.thread_id,
    status: row.status,
    requested_by_agent: row.requested_by_agent,
    dispatch_reason: row.dispatch_reason,
    model_used: row.model_used,
    fallback_chain: row.fallback_chain,
    fallback_count: fallbackChain.length,
    has_fallback: fallbackChain.length > 0,
    usage_json: row.usage_json,
    prompt_tokens: row.prompt_tokens,
    completion_tokens: row.completion_tokens,
    total_tokens: row.total_tokens,
    response_cost_usd: normalizeOptionalNumber(row.response_cost_usd),
    started_at: row.started_at,
    finished_at: row.finished_at,
    created_at: row.created_at,
  };
}

module.exports = {
  mapRunRow,
};
