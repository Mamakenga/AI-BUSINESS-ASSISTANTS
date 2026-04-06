"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  FIXED_SCAFFOLDING_TOKEN_CEILING,
  buildExecutionMessages,
  buildSystemPrompt,
  deriveRequestType,
  isLeaderDigestScheduledRun,
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

test("isLeaderDigestScheduledRun detects assistant leader digests only", () => {
  assert.equal(
    isLeaderDigestScheduledRun({
      role: { id: "assistant" },
      run: { requested_by_agent: "scheduler", dispatch_reason: "Prepare the daily brief for the leader in Russian." },
    }),
    true
  );

  assert.equal(
    isLeaderDigestScheduledRun({
      role: { id: "assistant" },
      run: { requested_by_agent: "scheduler", dispatch_reason: "Prepare the weekly digest for the leader in Russian." },
    }),
    true
  );

  assert.equal(
    isLeaderDigestScheduledRun({
      role: { id: "researcher" },
      run: { requested_by_agent: "scheduler", dispatch_reason: "Prepare the weekly digest for the leader in Russian." },
    }),
    false
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
      compiled_pages: [
        {
          summary_short: "Parents respond better to practical AI examples than to abstract theory.",
        },
      ],
      owner: [{ fact: "Founder prefers concise answers." }],
      business: [{ fact: "School is based in Varna." }],
      decisions: {
        owner: [{ decision: "Keep reports practical." }],
      },
    },
  });

  assert.match(result.prompt, /Role id: researcher/);
  assert.match(result.prompt, /Compare competitors in Varna/);
  assert.match(result.prompt, /Compiled knowledge:/);
  assert.match(result.prompt, /Parents respond better to practical AI examples/);
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

test("buildSystemPrompt trims compiled knowledge snippets separately from atomic memory facts", () => {
  const longSummary = (label) => `${label} ${"x".repeat(220)}`;
  const result = buildSystemPrompt({
    role: {
      id: "assistant",
      execution_mode: "single_role_worker",
      output_contract: "assistant_summary_v1",
    },
    run: {
      task_id: "task_91",
    },
    task: {
      id: "task_91",
      title: "Prepare a short founder update",
      status: "inbox",
      priority: "medium",
    },
    handoff_messages: [],
    memory_bundle: {
      compiled_pages: [
        { summary_short: longSummary("compiled-summary-1") },
        { summary_short: longSummary("compiled-summary-2") },
        { summary_short: longSummary("compiled-summary-3") },
      ],
      owner: [{ fact: "Founder prefers concise answers." }],
      business: [],
      role: [],
      task: [],
      decisions: {
        owner: [],
        business: [],
        task: [],
      },
    },
  });

  assert.match(result.prompt, /Compiled knowledge:/);
  assert.match(result.prompt, /compiled-summary-1/);
  assert.doesNotMatch(result.prompt, /compiled-summary-3/);
  assert.equal(result.meta.compiled_knowledge_count, 2);
  assert.match(result.prompt, /Founder prefers concise answers/);
});

test("buildSystemPrompt gives scheduled leader digests richer compiled knowledge guidance", () => {
  const result = buildSystemPrompt({
    role: {
      id: "assistant",
      execution_mode: "single_role_worker",
      output_contract: "assistant_summary_v1",
    },
    run: {
      requested_by_agent: "scheduler",
      dispatch_reason: "Prepare the weekly digest for the leader in Russian.",
      task_id: null,
    },
    task: null,
    founder_request: "Prepare the weekly digest for the leader in Russian.",
    handoff_messages: [],
    memory_bundle: {
      compiled_pages: [
        {
          summary_short: "Short compiled summary.",
          summary_full: "Full compiled summary with more concrete business context for the leader digest.",
          open_questions_json: [
            "Какой финальный вариант позиционирования подтверждаем первым?",
            "Кто владеет дедлайнами по новым программам?",
          ],
        },
      ],
      owner: [],
      business: [],
      role: [],
      task: [],
      decisions: {
        owner: [],
        business: [],
        task: [],
      },
    },
  });

  assert.match(result.prompt, /Leader scheduled digest rules:/);
  assert.match(result.prompt, /Prioritize compiled knowledge summaries when they are available/i);
  assert.match(result.prompt, /Use compiled knowledge to anchor confirmed sections before adding raw memory details/i);
  assert.match(result.prompt, /Surface up to 3 most material open questions when the context supports them/i);
  assert.match(result.prompt, /Full compiled summary with more concrete business context/);
  assert.match(result.prompt, /Compiled open questions:/);
  assert.match(result.prompt, /Какой финальный вариант позиционирования подтверждаем первым\?/);
  assert.match(result.prompt, /Кто владеет дедлайнами по новым программам\?/);
  assert.doesNotMatch(result.prompt, /- Short compiled summary\./);
});

test("buildSystemPrompt sanitizes internal identifiers from memory facts and handoffs", () => {
  const result = buildSystemPrompt({
    role: {
      id: "critic",
      execution_mode: "single_role_worker",
      output_contract: "critic_review_v1",
    },
    run: {
      task_id: null,
      requested_by_agent: null,
    },
    task: null,
    founder_request: "@critic есть ли сейчас у нас слабые места?",
    handoff_messages: [
      { from_agent: "researcher", content: "Есть только один зафиксированный конкурентный факт (ID: 7a04104a)." },
      { from_agent: "assistant", content: "Последний handoff thread_id: 7a04104a-18c8-4f1f-8f98-58d63737c820." },
    ],
    memory_bundle: {
      business: [{ fact: "Есть только один долгосрочный факт о конкуренте (запись 7a04104a)." }],
      decisions: {
        owner: [{ decision: "Опираемся только на подтвержденные сигналы, без memory_id: 7a04104a." }],
      },
    },
  });

  assert.doesNotMatch(result.prompt, /7a04104a/i);
  assert.doesNotMatch(result.prompt, /thread_id/i);
  assert.doesNotMatch(result.prompt, /memory_id/i);
  assert.match(result.prompt, /Есть только один долгосрочный факт о конкуренте/);
  assert.match(result.prompt, /Есть только один зафиксированный конкурентный факт/);
  assert.match(result.prompt, /Опираемся только на подтвержденные сигналы/);
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
  assert.match(result.prompt, /If fresh information is limited, say that explicitly, do not invent missing facts/i);
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
  assert.match(result.prompt, /If evidence is thin, say that directly, do not guess/i);
  assert.match(result.prompt, /best available answer plus one concrete next step/i);
  assert.match(result.prompt, /Do not end the answer with a request to clarify the whole situation/i);
  assert.match(result.prompt, /Never quote raw memory labels or internal scope tags/i);
  assert.match(result.prompt, /Never mention internal record ids, UUIDs, memory ids, or database-style identifiers/i);
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

test("buildSystemPrompt adds direct-answer guardrails for finance anomaly questions", () => {
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
    founder_request: "@finance есть ли у нас сейчас явные финансовые аномалии или тревожные сигналы?",
    handoff_messages: [],
    memory_bundle: {
      business: [{ fact: "Свежих подтвержденных финансовых аномалий в памяти сейчас нет." }],
    },
  });

  assert.match(result.prompt, /Direct-answer rules:/);
  assert.match(result.prompt, /Finance direct-answer rules:/);
  assert.match(result.prompt, /answer from the available numbers, memory, and recent evidence instead of asking for a full finance brief/i);
  assert.match(result.prompt, /If confirmed financial evidence is limited, say that directly/i);
  assert.match(
    result.prompt,
    /what is confirmed in the available financial picture, b\) what remains unclear or unconfirmed, c\) one safest next finance check or action/i
  );
  assert.match(
    result.prompt,
    /Even when confirmed financial evidence is absent, still include b\) what remains unclear or unconfirmed and c\) one safest next finance check or action/i
  );
  assert.equal(result.meta.request_type, "direct-answer");
});

test("buildSystemPrompt adds direct-answer guardrails for critic weakness questions", () => {
  const result = buildSystemPrompt({
    role: {
      id: "critic",
      execution_mode: "single_role_worker",
      output_contract: "critic_review_v1",
    },
    run: {
      task_id: null,
      requested_by_agent: null,
    },
    task: null,
    founder_request: "@critic есть ли сейчас у нас слабые места, противоречия или рискованные допущения в текущем контуре?",
    handoff_messages: [],
    memory_bundle: {
      business: [{ fact: "Подтвержденных свежих critic-сигналов по слабым местам в памяти сейчас мало." }],
    },
  });

  assert.match(result.prompt, /Direct-answer rules:/);
  assert.match(result.prompt, /Critic direct-answer rules:/);
  assert.match(
    result.prompt,
    /answer from the available evidence, memory, and recent handoffs instead of inventing a broad strategic audit/i
  );
  assert.match(result.prompt, /If confirmed evidence is limited, say that directly/i);
  assert.match(
    result.prompt,
    /what is confirmed as a weak point, contradiction, or fragile assumption, b\) what remains unverified or unclear, c\) one short safest verification step or corrective action/i
  );
  assert.match(
    result.prompt,
    /Even when confirmed evidence is absent, still include b\) what remains unverified or unclear and c\) one short safest verification step or corrective action instead of inventing detailed business risks/i
  );
  assert.match(
    result.prompt,
    /Do not turn c\) into a long intake questionnaire, multi-step audit plan, or checklist for filling the whole business profile/i
  );
  assert.equal(result.meta.request_type, "direct-answer");
});

test("buildSystemPrompt adds direct-answer guardrails for methodist curriculum questions", () => {
  const result = buildSystemPrompt({
    role: {
      id: "methodist",
      execution_mode: "single_role_worker",
      output_contract: "methodist_plan_v1",
    },
    run: {
      task_id: null,
      requested_by_agent: null,
    },
    task: null,
    founder_request: "@methodist помоги структурировать мини-курс по AI для родителей",
    handoff_messages: [],
    memory_bundle: {
      owner: [{ fact: "Руководитель предпочитает короткие практичные ответы на русском." }],
    },
  });

  assert.match(result.prompt, /Direct-answer rules:/);
  assert.match(result.prompt, /Methodist direct-answer rules:/);
  assert.match(
    result.prompt,
    /answer from the available educational context instead of asking for a broad intake questionnaire/i
  );
  assert.match(result.prompt, /If confirmed teaching context is limited, say that directly/i);
  assert.match(
    result.prompt,
    /a short draft learning goal or audience framing, b\) a 3-5 block module flow or lesson sequence, c\) one safest next curriculum step/i
  );
  assert.match(
    result.prompt,
    /still include a draft structure and one safest next curriculum step instead of stopping at generic clarification/i
  );
  assert.match(
    result.prompt,
    /Do not turn the answer into a broad questionnaire about the whole audience, business, or training system/i
  );
  assert.match(
    result.prompt,
    /At most one short clarification may appear inside c\); never return a checklist or series of intake questions instead of the draft structure itself/i
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
