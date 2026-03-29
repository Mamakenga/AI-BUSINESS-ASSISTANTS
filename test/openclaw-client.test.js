"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildOpenClawExecutePayload,
  normalizeOpenClawConfig,
} = require("../src/openclaw-client");

test("normalizeOpenClawConfig requires execute url", () => {
  assert.throws(() => normalizeOpenClawConfig({}), /OPENCLAW_EXECUTE_URL is required/);
});

test("buildOpenClawExecutePayload keeps role and memory context together", () => {
  const payload = buildOpenClawExecutePayload({
    role: {
      id: "researcher",
      execution_mode: "single_role_worker",
      preferred_models: ["gemini", "claude", "gpt"],
      output_contract: "research_summary_v1",
    },
    run: {
      id: 12,
      agent: "researcher",
      task_id: "task_12",
      thread_id: "thread_12",
    },
    task: {
      id: "task_12",
      title: "Compare competitors",
    },
    founder_request: "@researcher compare competitors in Varna",
    handoff_messages: [{ id: 4, content: "Need pricing focus." }],
    memory_bundle: {
      owner: [{ id: 1, fact: "Founder prefers concise answers." }],
      meta: { total_items: 1 },
    },
  });

  assert.equal(payload.role_id, "researcher");
  assert.equal(payload.execution_mode, "single_role_worker");
  assert.equal(payload.output_contract, "research_summary_v1");
  assert.equal(payload.run.id, 12);
  assert.equal(payload.task.title, "Compare competitors");
  assert.equal(payload.founder_request, "@researcher compare competitors in Varna");
  assert.equal(payload.handoff_messages.length, 1);
  assert.equal(payload.memory_bundle.meta.total_items, 1);
});
