"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildExecutionMessages,
  buildSystemPrompt,
  deriveRequestType,
} = require("../src/system-prompts");

test("deriveRequestType detects orchestration and direct answers", () => {
  assert.equal(
    deriveRequestType({
      role: { execution_mode: "multi_role_router" },
      run: { task_id: "task_1" },
    }),
    "orchestration"
  );

  assert.equal(
    deriveRequestType({
      role: { execution_mode: "single_role_worker" },
      run: { task_id: null },
    }),
    "direct-answer"
  );
});

test("buildSystemPrompt includes role, task, memory, and handoff context", () => {
  const result = buildSystemPrompt({
    role: {
      id: "researcher",
      execution_mode: "single_role_worker",
      output_contract: "research_summary_v1",
    },
    run: {
      task_id: "task_1",
    },
    task: {
      id: "task_1",
      title: "Compare competitors in Varna",
      status: "inbox",
      priority: "medium",
    },
    handoff_messages: [
      { from_agent: "orchestrator", content: "Need focus on pricing." },
    ],
    memory_bundle: {
      owner: [{ fact: "Founder prefers concise answers." }],
      business: [{ fact: "School is based in Varna." }],
      decisions: {
        owner: [{ decision: "Keep reports practical." }],
      },
    },
  });

  assert.match(result.prompt, /Role id: researcher/);
  assert.match(result.prompt, /Compare competitors in Varna/);
  assert.match(result.prompt, /Founder prefers concise answers/);
  assert.match(result.prompt, /Need focus on pricing/);
  assert.equal(result.meta.request_type, "task-execution");
});

test("buildExecutionMessages falls back to task title when founder request is missing", () => {
  const result = buildExecutionMessages({
    role: {
      id: "assistant",
      execution_mode: "single_role_worker",
      output_contract: "assistant_summary_v1",
    },
    run: {
      task_id: "task_22",
    },
    task: {
      title: "Prepare a short update for the founder",
    },
    founder_request: null,
    handoff_messages: [],
    memory_bundle: null,
  });

  assert.equal(result.messages.length, 2);
  assert.equal(result.messages[1].role, "user");
  assert.match(result.messages[1].content, /Prepare a short update/);
});
