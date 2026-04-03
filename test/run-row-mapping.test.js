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
});
