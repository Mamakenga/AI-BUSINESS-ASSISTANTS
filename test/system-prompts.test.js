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
  assert.doesNotMatch(result.prompt, /Owner context:/);
  assert.doesNotMatch(result.prompt, /Business context:/);
  assert.doesNotMatch(result.prompt, /Role context:/);
  assert.doesNotMatch(result.prompt, /Memory bundle:\n- \[/);
  assert.ok(result.meta.memory_fact_count >= 1);
  assert.ok(result.meta.memory_fact_count < 10);
  assert.ok(result.prompt.length <= FIXED_SCAFFOLDING_TOKEN_CEILING * 4);
});

test("buildSystemPrompt adds scheduled-run guardrails to prevent clarification loops", () => {
  const result = buildSystemPrompt({
    role: {
      id: "assistant",
      execution_mode: "single_role_worker",
      output_contract: "assistant_summary_v1",
    },
    run: {
      requested_by_agent: "scheduler",
      task_id: null,
    },
    task: null,
    founder_request: "Prepare the daily brief for the leader in Russian.",
    handoff_messages: [],
    memory_bundle: null,
  });

  assert.match(result.prompt, /Scheduled-run rules:/);
  assert.match(result.prompt, /Do not ask follow-up questions/);
  assert.match(result.prompt, /If fresh information is limited/);
  assert.equal(result.meta.request_type, "task-execution");
});

test("buildSystemPrompt adds direct-answer guardrails for assistant urgency questions", () => {
  const result = buildSystemPrompt({
    role: {
      id: "assistant",
      execution_mode: "single_role_worker",
      output_contract: "assistant_summary_v1",
    },
    run: {
      task_id: null,
      requested_by_agent: null,
    },
    task: null,
    founder_request: "@assistant что у нас сейчас самое срочное?",
    handoff_messages: [],
    memory_bundle: {
      owner: [{ fact: "Leader prefers concise practical answers." }],
    },
  });

  assert.match(result.prompt, /Direct-answer rules:/);
  assert.match(result.prompt, /Do not ask generic follow-up questions/);
  assert.match(result.prompt, /best available answer plus one concrete next step/i);
  assert.match(result.prompt, /Do not end the answer with a request to clarify the whole situation/i);
  assert.match(result.prompt, /Never quote raw memory labels or internal scope tags/i);
  assert.match(result.prompt, /Assistant direct-answer rules:/);
  assert.match(result.prompt, /answer from the available context instead of asking for a broad project restatement/i);
  assert.match(result.prompt, /what is confirmed right now, b\) what is unclear, c\) the safest next action/i);
  assert.equal(result.meta.request_type, "direct-answer");
});

test("buildSystemPrompt keeps generic direct-answer guardrails for non-assistant roles only", () => {
  const result = buildSystemPrompt({
    role: {
      id: "finance_analyst",
      execution_mode: "single_role_worker",
      output_contract: "finance_review_v1",
    },
    run: {
      task_id: null,
      requested_by_agent: null,
    },
    task: null,
    founder_request: "@finance сколько у нас учеников?",
    handoff_messages: [],
    memory_bundle: null,
  });

  assert.match(result.prompt, /Direct-answer rules:/);
  assert.match(result.prompt, /Do not ask generic follow-up questions/);
  assert.doesNotMatch(result.prompt, /Assistant direct-answer rules:/);
  assert.equal(result.meta.request_type, "direct-answer");
});

test("buildSystemPrompt adds direct-answer guardrails for researcher signal questions", () => {
  const result = buildSystemPrompt({
    role: {
      id: "researcher",
      execution_mode: "single_role_worker",
      output_contract: "research_summary_v1",
    },
    run: {
      task_id: null,
      requested_by_agent: null,
    },
    task: null,
    founder_request: "@researcher есть ли у нас свежие сигналы по конкурентам в Варне?",
    handoff_messages: [],
    memory_bundle: {
      business: [{ fact: "Свежих подтвержденных сигналов по конкурентам в Варне сейчас нет." }],
    },
  });

  assert.match(result.prompt, /Direct-answer rules:/);
  assert.match(result.prompt, /Researcher direct-answer rules:/);
  assert.match(result.prompt, /answer from the available evidence instead of asking for a broad research brief/i);
  assert.match(result.prompt, /If no fresh confirmed signals exist, say that directly/i);
  assert.match(result.prompt, /confirmed signals, b\) what remains unconfirmed, c\) one focused next research step/i);
  assert.match(
    result.prompt,
    /Even when fresh confirmed signals are absent, still include b\) what remains unconfirmed and c\) one focused next research step/i
  );
  assert.equal(result.meta.request_type, "direct-answer");
});

test("buildSystemPrompt does not inject direct-answer guardrails into scheduled runs", () => {
  const result = buildSystemPrompt({
    role: {
      id: "assistant",
      execution_mode: "single_role_worker",
      output_contract: "assistant_summary_v1",
    },
    run: {
      requested_by_agent: "scheduler",
      task_id: null,
    },
    task: null,
    founder_request: "Prepare the daily brief for the leader in Russian.",
    handoff_messages: [],
    memory_bundle: null,
  });

  assert.match(result.prompt, /Scheduled-run rules:/);
  assert.doesNotMatch(result.prompt, /Direct-answer rules:/);
  assert.doesNotMatch(result.prompt, /Assistant direct-answer rules:/);
  assert.equal(result.meta.request_type, "task-execution");
});
