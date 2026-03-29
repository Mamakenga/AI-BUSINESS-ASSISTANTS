"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildStubExecutionResponse,
  normalizeStubConfig,
} = require("../src/openclaw-stub");

test("normalizeStubConfig defaults to port 3201", () => {
  const config = normalizeStubConfig({});

  assert.equal(config.port, 3201);
});

test("buildStubExecutionResponse returns worker-compatible completed payload", () => {
  const payload = buildStubExecutionResponse({
    role_id: "assistant",
    output_contract: "assistant_brief_v1",
    run: {
      task_id: null,
      thread_id: "thread_1",
    },
    founder_request: "@assistant what is urgent today?",
  });

  assert.equal(payload.status, "completed");
  assert.equal(payload.model_used, "stub/local-demo");
  assert.deepEqual(payload.fallback_chain, ["stub/local-demo"]);
  assert.match(payload.reply_text, /\[DEMO\] assistant reply/);
  assert.equal(payload.artifact_type, "assistant_brief_v1");
  assert.equal(payload.artifact_content.source, "openclaw_stub_demo");
});

test("buildStubExecutionResponse includes task title when task exists", () => {
  const payload = buildStubExecutionResponse({
    role: {
      id: "researcher",
      output_contract: "research_summary_v1",
    },
    task: {
      title: "Compare competitors in Varna",
    },
    founder_request: "@researcher compare competitors",
    run: {
      task_id: "task_1",
      thread_id: "thread_1",
    },
  });

  assert.match(payload.reply_text, /Compare competitors in Varna/);
  assert.equal(payload.artifact_content.task_id, "task_1");
});
