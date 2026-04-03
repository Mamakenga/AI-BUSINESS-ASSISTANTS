"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { buildRunCompletion, TERMINAL_RUN_STATUSES } = require("../src/run-completion");

function createRunRow(overrides = {}) {
  return {
    id: 101,
    agent: "researcher",
    task_id: "task_123",
    thread_id: "thread_123",
    status: "pending",
    fallback_chain: [],
    ...overrides,
  };
}

test("terminal statuses are limited to completion outcomes", () => {
  assert.deepEqual(Array.from(TERMINAL_RUN_STATUSES), ["completed", "failed", "canceled"]);
});

test("task-bound completed run creates an artifact with default output contract", () => {
  const completion = buildRunCompletion(
    {
      actor_agent: "researcher",
      status: "completed",
      model_used: "gemini",
      usage_json: {
        prompt_tokens: 12,
        completion_tokens: 30,
        total_tokens: 42,
      },
      prompt_tokens: 12,
      completion_tokens: 30,
      total_tokens: 42,
      response_cost_usd: 0.0012,
      artifact_content: {
        summary: "Competitor comparison is ready",
      },
    },
    createRunRow()
  );

  assert.equal(completion.run_update.status, "completed");
  assert.equal(completion.run_update.model_used, "gemini");
  assert.deepEqual(completion.run_update.fallback_chain, []);
  assert.deepEqual(completion.run_update.usage_json, {
    prompt_tokens: 12,
    completion_tokens: 30,
    total_tokens: 42,
  });
  assert.equal(completion.run_update.prompt_tokens, 12);
  assert.equal(completion.run_update.completion_tokens, 30);
  assert.equal(completion.run_update.total_tokens, 42);
  assert.equal(completion.run_update.response_cost_usd, 0.0012);
  assert.deepEqual(completion.artifact, {
    task_id: "task_123",
    artifact_type: "research_summary_v1",
    created_by: "researcher",
    content: {
      summary: "Competitor comparison is ready",
    },
  });
});

test("task-less completed run does not require artifact creation", () => {
  const completion = buildRunCompletion(
    {
      actor_agent: "assistant",
      status: "completed",
    },
    createRunRow({
      agent: "assistant",
      task_id: null,
    })
  );

  assert.equal(completion.artifact, null);
});

test("completed task-bound run requires artifact content", () => {
  assert.throws(
    () =>
      buildRunCompletion(
        {
          actor_agent: "researcher",
          status: "completed",
        },
        createRunRow()
      ),
    /artifact_content is required/
  );
});

test("only the assigned role can complete the run", () => {
  assert.throws(
    () =>
      buildRunCompletion(
        {
          actor_agent: "assistant",
          status: "completed",
          artifact_content: { summary: "done" },
        },
        createRunRow()
      ),
    /Only the assigned role can complete this run/
  );
});

test("terminal run cannot be completed again", () => {
  assert.throws(
    () =>
      buildRunCompletion(
        {
          actor_agent: "researcher",
          status: "completed",
          artifact_content: { summary: "done again" },
        },
        createRunRow({
          status: "completed",
        })
      ),
    /Run already in terminal state/
  );
});

test("fallback chain must stay an array", () => {
  assert.throws(
    () =>
      buildRunCompletion(
        {
          actor_agent: "researcher",
          status: "failed",
          fallback_chain: "claude>gpt",
        },
        createRunRow()
      ),
    /fallback_chain must be an array/
  );
});

test("telemetry fields must stay normalized", () => {
  assert.throws(
    () =>
      buildRunCompletion(
        {
          actor_agent: "researcher",
          status: "failed",
          prompt_tokens: -1,
        },
        createRunRow()
      ),
    /prompt_tokens must be a non-negative integer/
  );

  assert.throws(
    () =>
      buildRunCompletion(
        {
          actor_agent: "researcher",
          status: "failed",
          usage_json: "bad",
        },
        createRunRow()
      ),
    /usage_json must be an object/
  );
});
