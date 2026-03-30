"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  FIXED_SCAFFOLDING_TOKEN_CEILING,
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

  assert.equal(
    deriveRequestType({
      role: { execution_mode: "single_role_worker" },
      run: { task_id: null, requested_by_agent: "scheduler" },
    }),
    "task-execution"
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

test("buildSystemPrompt keeps latest handoffs and trims oldest first when budget is tight", () => {
  const oversized = "x".repeat(680);
  const result = buildSystemPrompt({
    role: {
      id: "assistant",
      execution_mode: "single_role_worker",
      output_contract: "assistant_summary_v1",
    },
    run: {
      task_id: "task_55",
    },
    task: {
      id: "task_55",
      title: "Summarize founder updates",
      status: "inbox",
      priority: "high",
    },
    handoff_messages: [
      { from_agent: "orchestrator", content: "Oldest handoff should drop." },
      { from_agent: "researcher", content: `Older recent handoff ${oversized}` },
      { from_agent: "critic", content: `Newest recent handoff ${oversized}` },
    ],
    memory_bundle: null,
  });

  assert.equal(result.meta.handoff_count, 1);
  assert.doesNotMatch(result.prompt, /Oldest handoff should drop/);
  assert.doesNotMatch(result.prompt, /Older recent handoff/);
  assert.match(result.prompt, /Newest recent handoff/);
});

test("buildSystemPrompt trims memory facts to budget and preserves task context", () => {
  const longFact = (label) => `${label} ${"x".repeat(260)}`;
  const result = buildSystemPrompt({
    role: {
      id: "researcher",
      execution_mode: "single_role_worker",
      output_contract: "research_summary_v1",
    },
    run: {
      task_id: "task_91",
    },
    task: {
      id: "task_91",
      title: "Compare three competitors in Varna",
      status: "inbox",
      priority: "medium",
    },
    handoff_messages: [],
    memory_bundle: {
      owner: [{ fact: longFact("owner-fact-1") }, { fact: longFact("owner-fact-2") }, { fact: longFact("owner-fact-3") }],
      business: [{ fact: longFact("business-fact-1") }, { fact: longFact("business-fact-2") }],
      role: [{ fact: longFact("role-fact-1") }, { fact: longFact("role-fact-2") }],
      task: [{ fact: longFact("task-fact-1") }],
      decisions: {
        owner: [{ decision: longFact("decision-owner-1") }],
        business: [{ decision: longFact("decision-business-1") }],
        task: [{ decision: longFact("decision-task-1") }],
      },
    },
  });

  assert.match(result.prompt, /Compare three competitors in Varna/);
  assert.match(result.prompt, /owner-fact-1/);
  assert.doesNotMatch(result.prompt, /decision-task-1/);
  assert.ok(result.meta.memory_fact_count >= 1);
  assert.ok(result.meta.memory_fact_count < 10);
  assert.ok(result.prompt.length <= FIXED_SCAFFOLDING_TOKEN_CEILING * 4);
});
