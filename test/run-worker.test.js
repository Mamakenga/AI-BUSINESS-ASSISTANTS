"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  WORKER_ROLE_IDS,
  buildRunCompletionInput,
  buildRunExecutionContext,
  normalizeExecutionResult,
  normalizeWorkerRoleIds,
} = require("../src/run-worker");

test("normalizeWorkerRoleIds defaults to all non-service roles", () => {
  const roleIds = normalizeWorkerRoleIds();

  assert.deepEqual(roleIds, WORKER_ROLE_IDS);
  assert.ok(roleIds.includes("orchestrator"));
  assert.ok(roleIds.includes("assistant"));
  assert.ok(!roleIds.includes("memory_curator"));
});

test("buildRunExecutionContext extracts founder request and handoff messages", () => {
  const context = buildRunExecutionContext({
    run: {
      id: 51,
      agent: "researcher",
      task_id: "task_51",
      thread_id: "thread_51",
      requested_by_agent: "founder",
      dispatch_reason: null,
      created_at: "2026-03-29T10:00:00.000Z",
    },
    task: {
      id: "task_51",
      title: "Compare competitors in Varna",
      status: "inbox",
      assigned_role: "researcher",
      priority: "medium",
      due_at: null,
      thread_id: "thread_51",
    },
    messages: [
      { id: 1, from_agent: "founder", to_agent: "researcher", message_type: "request", content: "@researcher compare competitors", created_at: "2026-03-29T10:00:00.000Z" },
      { id: 2, from_agent: "orchestrator", to_agent: "researcher", message_type: "handoff", content: "Need price comparison.", created_at: "2026-03-29T10:01:00.000Z" },
    ],
    memory_bundle: {
      meta: { total_items: 3 },
    },
  });

  assert.equal(context.founder_request, "@researcher compare competitors");
  assert.equal(context.handoff_messages.length, 1);
  assert.equal(context.handoff_messages[0].content, "Need price comparison.");
  assert.equal(context.role.id, "researcher");
  assert.equal(context.role.model_alias, "researcher-model");
});

test("buildRunExecutionContext falls back to scheduler dispatch_reason when founder request is absent", () => {
  const context = buildRunExecutionContext({
    run: {
      id: 61,
      agent: "assistant",
      task_id: null,
      thread_id: null,
      requested_by_agent: "scheduler",
      dispatch_reason: "Prepare the daily founder brief in Russian.",
      created_at: "2026-03-30T10:00:00.000Z",
    },
    task: null,
    messages: [],
    memory_bundle: null,
  });

  assert.equal(context.founder_request, "Prepare the daily founder brief in Russian.");
});

test("buildRunExecutionContext prefers scheduler dispatch_reason over stale founder thread history", () => {
  const context = buildRunExecutionContext({
    run: {
      id: 62,
      agent: "assistant",
      task_id: null,
      thread_id: "thread_jobs_founder",
      requested_by_agent: "scheduler",
      dispatch_reason: "Prepare the daily founder brief in Russian.",
      created_at: "2026-03-30T10:00:00.000Z",
    },
    task: null,
    messages: [
      {
        id: 1,
        from_agent: "founder",
        to_agent: "assistant",
        message_type: "request",
        content: "@assistant answer yesterday's question",
        created_at: "2026-03-29T10:00:00.000Z",
      },
    ],
    memory_bundle: null,
  });

  assert.equal(context.founder_request, "Prepare the daily founder brief in Russian.");
});

test("buildRunCompletionInput creates artifact payload for task-bound run", () => {
  const result = buildRunCompletionInput(
    {
      id: 77,
      agent: "assistant",
      task_id: "task_77",
    },
    {
      status: "completed",
      model_used: "gpt",
      fallback_chain: ["gpt"],
      usage_json: {
        prompt_tokens: 15,
        completion_tokens: 20,
        total_tokens: 35,
      },
      prompt_tokens: 15,
      completion_tokens: 20,
      total_tokens: 35,
      response_cost_usd: 0.0025,
      reply_text: "Here is your digest.",
    }
  );

  assert.equal(result.completion.actor_agent, "assistant");
  assert.equal(result.completion.status, "completed");
  assert.deepEqual(result.completion.usage_json, {
    prompt_tokens: 15,
    completion_tokens: 20,
    total_tokens: 35,
  });
  assert.equal(result.completion.prompt_tokens, 15);
  assert.equal(result.completion.completion_tokens, 20);
  assert.equal(result.completion.total_tokens, 35);
  assert.equal(result.completion.response_cost_usd, 0.0025);
  assert.deepEqual(result.completion.artifact_content, {
    reply_text: "Here is your digest.",
  });
});

test("buildRunCompletionInput replaces thin scheduled leader digest output with safe fallback", () => {
  const result = buildRunCompletionInput(
    {
      id: 90,
      agent: "assistant",
      task_id: null,
      requested_by_agent: "scheduler",
      dispatch_reason: "Prepare the daily brief for the leader in Russian.",
    },
    {
      status: "completed",
      model_used: "assistant-model",
      fallback_chain: [],
      reply_text: "Invented upbeat executive summary.",
    },
    {
      run: {
        id: 90,
        agent: "assistant",
        task_id: null,
        requested_by_agent: "scheduler",
        dispatch_reason: "Prepare the daily brief for the leader in Russian.",
      },
      task: null,
      handoff_messages: [],
      memory_bundle: null,
    }
  );

  assert.ok(result.reply_text.includes("Ежедневный бриф для руководителя"));
  assert.ok(result.reply_text.includes("Что подтверждено"));
  assert.ok(result.reply_text.includes("Что не подтверждено"));
  assert.ok(result.reply_text.includes("Безопасный следующий шаг"));
  assert.ok(result.completion.fallback_chain.includes("scheduled_empty_context_guard"));
});

test("buildRunCompletionInput preserves scheduled leader digest output when context is present", () => {
  const result = buildRunCompletionInput(
    {
      id: 91,
      agent: "assistant",
      task_id: null,
      requested_by_agent: "scheduler",
      dispatch_reason: "Prepare the weekly digest for the leader in Russian.",
    },
    {
      status: "completed",
      model_used: "assistant-model",
      fallback_chain: [],
      reply_text: "Что подтверждено: есть реальные факты.",
    },
    {
      run: {
        id: 91,
        agent: "assistant",
        task_id: null,
        requested_by_agent: "scheduler",
        dispatch_reason: "Prepare the weekly digest for the leader in Russian.",
      },
      task: null,
      handoff_messages: [],
      memory_bundle: {
        business: [{ fact: "Есть подтвержденный бизнес-факт." }],
      },
    }
  );

  assert.equal(result.reply_text, "Что подтверждено: есть реальные факты.");
  assert.deepEqual(result.completion.fallback_chain, []);
});

test("buildRunCompletionInput replaces thin scheduled competitor watch output with safe fallback", () => {
  const result = buildRunCompletionInput(
    {
      id: 92,
      agent: "researcher",
      task_id: null,
      requested_by_agent: "scheduler",
      dispatch_reason: "Run the daily competitor watch in Russian.",
    },
    {
      status: "completed",
      model_used: "researcher-model",
      fallback_chain: [],
      reply_text: "Invented competitor events and market shifts.",
    },
    {
      run: {
        id: 92,
        agent: "researcher",
        task_id: null,
        requested_by_agent: "scheduler",
        dispatch_reason: "Run the daily competitor watch in Russian.",
      },
      task: null,
      handoff_messages: [],
      memory_bundle: null,
    }
  );

  assert.ok(result.reply_text.includes("Ежедневный мониторинг конкурентов"));
  assert.ok(result.reply_text.includes("Подтвержденные сигналы конкурентов или рынка"));
  assert.ok(result.reply_text.includes("Почему это важно для нас"));
  assert.ok(result.reply_text.includes("Эскалация"));
  assert.ok(result.reply_text.includes("Рекомендованное следующее действие"));
  assert.ok(result.completion.fallback_chain.includes("scheduled_empty_context_guard"));
});

test("buildRunCompletionInput replaces thin scheduled finance review output with safe fallback", () => {
  const result = buildRunCompletionInput(
    {
      id: 93,
      agent: "finance_analyst",
      task_id: null,
      requested_by_agent: "scheduler",
      dispatch_reason: "Prepare the branch finance review in Russian.",
    },
    {
      status: "completed",
      model_used: "finance-model",
      fallback_chain: [],
      reply_text: "Invented branch anomalies and suspicious finance trends.",
    },
    {
      run: {
        id: 93,
        agent: "finance_analyst",
        task_id: null,
        requested_by_agent: "scheduler",
        dispatch_reason: "Prepare the branch finance review in Russian.",
      },
      task: null,
      handoff_messages: [],
      memory_bundle: null,
    }
  );

  assert.ok(result.reply_text.includes("Финансовый обзор филиала"));
  assert.ok(result.reply_text.includes("Аномалии или необычные сдвиги"));
  assert.ok(result.reply_text.includes("Рискованные тренды в цифрах"));
  assert.ok(result.reply_text.includes("Что требует эскалации руководителю"));
  assert.ok(result.reply_text.includes("Практическая рекомендация"));
  assert.ok(result.completion.fallback_chain.includes("scheduled_empty_context_guard"));
});

test("buildRunCompletionInput replaces thin scheduled risk review output with safe fallback", () => {
  const result = buildRunCompletionInput(
    {
      id: 94,
      agent: "critic",
      task_id: null,
      requested_by_agent: "scheduler",
      dispatch_reason: "Prepare the weekly risk review in Russian.",
    },
    {
      status: "completed",
      model_used: "critic-model",
      fallback_chain: [],
      reply_text: "Invented contradictions and expanded risk register.",
    },
    {
      run: {
        id: 94,
        agent: "critic",
        task_id: null,
        requested_by_agent: "scheduler",
        dispatch_reason: "Prepare the weekly risk review in Russian.",
      },
      task: null,
      handoff_messages: [],
      memory_bundle: null,
    }
  );

  assert.ok(result.reply_text.includes("Еженедельный обзор рисков"));
  assert.ok(result.reply_text.includes("Противоречия или точки напряжения"));
  assert.ok(result.reply_text.includes("Слабые допущения или хрупкая логика"));
  assert.ok(result.reply_text.includes("Что может стать рискованным следующим"));
  assert.ok(result.reply_text.includes("Эскалация или корректирующее действие"));
  assert.ok(result.completion.fallback_chain.includes("scheduled_empty_context_guard"));
});

test("normalizeExecutionResult requires reply_text for direct-answer runs", () => {
  assert.throws(
    () =>
      normalizeExecutionResult(
        {
          id: 88,
          agent: "assistant",
          task_id: null,
        },
        {
          status: "completed",
        }
      ),
    /Execution direct-answer response must include reply_text/
  );
});
