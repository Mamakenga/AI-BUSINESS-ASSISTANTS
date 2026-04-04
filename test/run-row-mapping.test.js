"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { mapRunRow } = require("../src/run-row-mapping");

test("mapRunRow normalizes numeric telemetry returned from Postgres", () => {
  const row = {
    id: 42,
    agent: "assistant",
    task_id: "task_123",
    thread_id: "thread_123",
    status: "completed",
    requested_by_agent: "founder",
    dispatch_reason: null,
    model_used: "assistant-model",
    fallback_chain: [],
    usage_json: {
      prompt_tokens: 20,
      completion_tokens: 40,
      total_tokens: 60,
    },
    prompt_tokens: 20,
    completion_tokens: 40,
    total_tokens: 60,
    response_cost_usd: "0.00420000",
    started_at: "2026-04-03T18:00:00.000Z",
    finished_at: "2026-04-03T18:00:05.000Z",
    created_at: "2026-04-03T17:59:59.000Z",
  };

  const mapped = mapRunRow(row);

  assert.equal(mapped.response_cost_usd, 0.0042);
  assert.equal(typeof mapped.response_cost_usd, "number");
  assert.equal(mapped.fallback_count, 0);
  assert.equal(mapped.has_fallback, false);
});

test("mapRunRow exposes fallback convenience fields", () => {
  const mapped = mapRunRow({
    id: 43,
    agent: "assistant",
    task_id: null,
    thread_id: null,
    status: "completed",
    requested_by_agent: "scheduler",
    dispatch_reason: "daily brief",
    model_used: "assistant-model",
    fallback_chain: ["scheduled_empty_context_guard"],
    usage_json: null,
    prompt_tokens: null,
    completion_tokens: null,
    total_tokens: null,
    response_cost_usd: null,
    started_at: null,
    finished_at: null,
    created_at: "2026-04-04T19:00:00.000Z",
  });

  assert.equal(mapped.fallback_count, 1);
  assert.equal(mapped.has_fallback, true);
});
