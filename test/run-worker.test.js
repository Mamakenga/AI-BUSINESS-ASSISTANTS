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
  assert.equal(context.role.runtime_limits.max_completion_tokens, 1200);
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

test("buildRunCompletionInput enforces runtime usage limits for direct answers", () => {
  const result = buildRunCompletionInput(
    {
      id: 95,
      agent: "assistant",
      task_id: null,
      requested_by_agent: "founder",
      dispatch_reason: null,
    },
    {
      status: "completed",
      model_used: "assistant-model",
      fallback_chain: [],
      completion_tokens: 950,
      total_tokens: 2600,
      response_cost_usd: 0.03,
      reply_text: "This answer exceeded the allowed runtime budget.",
    },
    {
      run: {
        id: 95,
        agent: "assistant",
        task_id: null,
        requested_by_agent: "founder",
        dispatch_reason: null,
      },
      role: {
        id: "assistant",
        runtime_limits: {
          max_completion_tokens: 900,
          max_total_tokens: 2500,
          max_response_cost_usd: 0.02,
        },
      },
      task: null,
      handoff_messages: [],
      memory_bundle: null,
    }
  );

  assert.equal(result.completion.status, "failed");
  assert.ok(result.completion.fallback_chain.includes("runtime_budget_guard"));
  assert.ok(result.completion.fallback_chain.includes("runtime_budget_guard/completion_tokens"));
  assert.ok(result.completion.fallback_chain.includes("runtime_budget_guard/total_tokens"));
  assert.ok(result.completion.fallback_chain.includes("runtime_budget_guard/response_cost_usd"));
  assert.match(result.reply_text, /runtime-лимита роли/i);
});

test("buildRunCompletionInput suppresses scheduled delivery when runtime usage limits are exceeded", () => {
  const result = buildRunCompletionInput(
    {
      id: 96,
      agent: "assistant",
      task_id: null,
      requested_by_agent: "scheduler",
      dispatch_reason: "Prepare the daily brief for the leader in Russian.",
    },
    {
      status: "completed",
      model_used: "assistant-model",
      fallback_chain: ["scheduled_empty_context_guard"],
      completion_tokens: 1000,
      total_tokens: 2700,
      response_cost_usd: 0.025,
      reply_text: "Over-budget scheduled output.",
    },
    {
      run: {
        id: 96,
        agent: "assistant",
        task_id: null,
        requested_by_agent: "scheduler",
        dispatch_reason: "Prepare the daily brief for the leader in Russian.",
      },
      role: {
        id: "assistant",
        runtime_limits: {
          max_completion_tokens: 900,
          max_total_tokens: 2500,
          max_response_cost_usd: 0.02,
        },
      },
      task: null,
      handoff_messages: [],
      memory_bundle: {
        business: [{ fact: "Есть подтвержденный факт." }],
      },
    }
  );

  assert.equal(result.completion.status, "failed");
  assert.equal(result.reply_text, null);
  assert.ok(result.completion.fallback_chain.includes("runtime_budget_guard"));
});

test("buildRunCompletionInput keeps a safe reply for founder task threads when runtime usage limits are exceeded", () => {
  const result = buildRunCompletionInput(
    {
      id: 97,
      agent: "researcher",
      task_id: "task_97",
      requested_by_agent: "founder",
      dispatch_reason: null,
    },
    {
      status: "completed",
      model_used: "researcher-model",
      fallback_chain: [],
      completion_tokens: 1300,
      total_tokens: 3600,
      response_cost_usd: 0.05,
      artifact_content: {
        summary: "Should not survive the budget guard.",
      },
      reply_text: "Over-budget founder task reply.",
    },
    {
      run: {
        id: 97,
        agent: "researcher",
        task_id: "task_97",
        requested_by_agent: "founder",
        dispatch_reason: null,
      },
      role: {
        id: "researcher",
        runtime_limits: {
          max_completion_tokens: 1200,
          max_total_tokens: 3500,
          max_response_cost_usd: 0.03,
        },
      },
      task: {
        id: "task_97",
        title: "Compare competitors",
      },
      handoff_messages: [],
      memory_bundle: null,
    }
  );

  assert.equal(result.completion.status, "failed");
  assert.match(result.reply_text, /runtime-лимита роли/i);
  assert.ok(result.completion.fallback_chain.includes("runtime_budget_guard"));
  assert.equal(result.completion.artifact_content, undefined);
});

test("buildRunCompletionInput blocks founder-facing replies that leak internal metadata", () => {
  const result = buildRunCompletionInput(
    {
      id: 98,
      agent: "assistant",
      task_id: null,
      requested_by_agent: "founder",
      dispatch_reason: null,
    },
    {
      status: "completed",
      model_used: "assistant-model",
      fallback_chain: [],
      reply_text: "Подтверждено: [business] есть только один факт, thread_id: 7a04104a-18c8-4f1f-8f98-58d63737c820.",
    },
    {
      run: {
        id: 98,
        agent: "assistant",
        task_id: null,
        requested_by_agent: "founder",
        dispatch_reason: null,
      },
      role: {
        id: "assistant",
        runtime_limits: {
          max_completion_tokens: 900,
          max_total_tokens: 2500,
          max_response_cost_usd: 0.02,
        },
      },
      task: null,
      handoff_messages: [],
      memory_bundle: null,
    }
  );

  assert.equal(result.completion.status, "failed");
  assert.ok(result.completion.fallback_chain.includes("founder_reply_quality_guard"));
  assert.ok(result.completion.fallback_chain.includes("founder_reply_quality_guard/internal_scope_tag"));
  assert.ok(result.completion.fallback_chain.includes("founder_reply_quality_guard/internal_identifier"));
  assert.match(result.reply_text, /внутренних служебных маркеров/i);
});

test("buildRunCompletionInput replaces unsafe scheduled founder-facing output with safe fallback", () => {
  const result = buildRunCompletionInput(
    {
      id: 99,
      agent: "assistant",
      task_id: null,
      requested_by_agent: "scheduler",
      dispatch_reason: "Prepare the daily brief for the leader in Russian.",
    },
    {
      status: "completed",
      model_used: "assistant-model",
      fallback_chain: [],
      reply_text: "Источник memory_curator:long_term_fact. [decision:owner] запись 7a04104a.",
    },
    {
      run: {
        id: 99,
        agent: "assistant",
        task_id: null,
        requested_by_agent: "scheduler",
        dispatch_reason: "Prepare the daily brief for the leader in Russian.",
      },
      role: {
        id: "assistant",
        runtime_limits: {
          max_completion_tokens: 900,
          max_total_tokens: 2500,
          max_response_cost_usd: 0.02,
        },
      },
      task: null,
      handoff_messages: [
        {
          from_agent: "researcher",
          content: "Есть один подтвержденный рыночный факт.",
        },
      ],
      memory_bundle: {
        business: [{ fact: "Есть один подтвержденный бизнес-факт." }],
      },
    }
  );

  assert.equal(result.completion.status, "failed");
  assert.ok(result.completion.fallback_chain.includes("founder_reply_quality_guard"));
  assert.ok(result.completion.fallback_chain.includes("founder_reply_quality_guard/internal_scope_tag"));
  assert.ok(result.completion.fallback_chain.includes("founder_reply_quality_guard/internal_identifier"));
  assert.ok(result.completion.fallback_chain.includes("founder_reply_quality_guard/internal_source_label"));
  assert.match(result.reply_text, /Ежедневный бриф для руководителя/i);
  assert.match(result.reply_text, /Статус публикации/i);
});

test("buildRunCompletionInput does not apply founder-facing quality gate to internal orchestrated runs", () => {
  const result = buildRunCompletionInput(
    {
      id: 100,
      agent: "researcher",
      task_id: "task_100",
      requested_by_agent: "orchestrator",
      dispatch_reason: "Research follow-up for pricing comparison.",
    },
    {
      status: "completed",
      model_used: "researcher-model",
      fallback_chain: [],
      artifact_content: {
        summary: "Contains [business] handoff notation for internal processing.",
      },
      reply_text: "Internal follow-up mentions [business] and thread_id: 7a04104a-18c8-4f1f-8f98-58d63737c820.",
    },
    {
      run: {
        id: 100,
        agent: "researcher",
        task_id: "task_100",
        requested_by_agent: "orchestrator",
        dispatch_reason: "Research follow-up for pricing comparison.",
      },
      role: {
        id: "researcher",
        runtime_limits: {
          max_completion_tokens: 1200,
          max_total_tokens: 3500,
          max_response_cost_usd: 0.03,
        },
      },
      task: {
        id: "task_100",
        title: "Compare competitors",
      },
      handoff_messages: [],
      memory_bundle: null,
    }
  );

  assert.equal(result.completion.status, "completed");
  assert.deepEqual(result.completion.fallback_chain, []);
  assert.equal(result.reply_text, "Internal follow-up mentions [business] and thread_id: 7a04104a-18c8-4f1f-8f98-58d63737c820.");
  assert.deepEqual(result.completion.artifact_content, {
    summary: "Contains [business] handoff notation for internal processing.",
  });
});

test("buildRunCompletionInput blocks methodist broad intake questionnaires and returns a safe curriculum scaffold", () => {
  const result = buildRunCompletionInput(
    {
      id: 101,
      agent: "methodist",
      task_id: null,
      requested_by_agent: "founder",
      dispatch_reason: null,
    },
    {
      status: "completed",
      model_used: "methodist-model",
      fallback_chain: [],
      reply_text:
        "\u0427\u0442\u043e\u0431\u044b \u0442\u043e\u0447\u043d\u043e \u0441\u0442\u0440\u0443\u043a\u0442\u0443\u0440\u0438\u0440\u043e\u0432\u0430\u0442\u044c \u043a\u0443\u0440\u0441, \u043c\u043d\u0435 \u043d\u0443\u0436\u043d\u043e \u043f\u043e\u043d\u044f\u0442\u044c: \u043a\u0442\u043e \u0446\u0435\u043b\u0435\u0432\u0430\u044f \u0430\u0443\u0434\u0438\u0442\u043e\u0440\u0438\u044f? \u043a\u0430\u043a\u043e\u0439 \u0432\u043e\u0437\u0440\u0430\u0441\u0442 \u0440\u043e\u0434\u0438\u0442\u0435\u043b\u0435\u0439? \u043a\u0430\u043a\u043e\u0439 \u0443\u0440\u043e\u0432\u0435\u043d\u044c \u043f\u043e\u0434\u0433\u043e\u0442\u043e\u0432\u043a\u0438? \u043a\u0430\u043a\u043e\u0439 \u0444\u043e\u0440\u043c\u0430\u0442 \u0438 \u0434\u043b\u0438\u0442\u0435\u043b\u044c\u043d\u043e\u0441\u0442\u044c? \u0441\u043a\u043e\u043b\u044c\u043a\u043e \u0437\u0430\u043d\u044f\u0442\u0438\u0439 \u043d\u0443\u0436\u043d\u043e?",
    },
    {
      run: {
        id: 101,
        agent: "methodist",
        task_id: null,
        requested_by_agent: "founder",
        dispatch_reason: null,
      },
      role: {
        id: "methodist",
        runtime_limits: {
          max_completion_tokens: 1200,
          max_total_tokens: 3000,
          max_response_cost_usd: 0.025,
        },
      },
      task: null,
      handoff_messages: [],
      memory_bundle: null,
    }
  );

  assert.equal(result.completion.status, "failed");
  assert.ok(result.completion.fallback_chain.includes("founder_reply_quality_guard"));
  assert.ok(result.completion.fallback_chain.includes("founder_reply_quality_guard/methodist_broad_intake"));
  assert.match(result.reply_text, /\u0431\u0435\u0437\u043e\u043f\u0430\u0441\u043d\u044b\u0439 \u0441\u0442\u0430\u0440\u0442\u043e\u0432\u044b\u0439 \u043a\u0430\u0440\u043a\u0430\u0441/i);
  assert.match(result.reply_text, /\u0427\u0435\u0440\u043d\u043e\u0432\u0430\u044f \u0441\u0442\u0440\u0443\u043a\u0442\u0443\u0440\u0430 \u043c\u0438\u043d\u0438-\u043a\u0443\u0440\u0441\u0430/i);
  assert.match(result.reply_text, /\u043f\u043e\u0434\u0442\u0432\u0435\u0440\u0434\u0438\u0442\u0435 \u0434\u043b\u0438\u0442\u0435\u043b\u044c\u043d\u043e\u0441\u0442\u044c \u0438 \u0444\u043e\u0440\u043c\u0430\u0442/i);
});

test("buildRunCompletionInput keeps generic leakage fallback for methodist metadata leaks", () => {
  const result = buildRunCompletionInput(
    {
      id: 102,
      agent: "methodist",
      task_id: null,
      requested_by_agent: "founder",
      dispatch_reason: null,
    },
    {
      status: "completed",
      model_used: "methodist-model",
      fallback_chain: [],
      reply_text: "������������: [business] ���� ���� ������� ���������, thread_id: 7a04104a-18c8-4f1f-8f98-58d63737c820.",
    },
    {
      run: {
        id: 102,
        agent: "methodist",
        task_id: null,
        requested_by_agent: "founder",
        dispatch_reason: null,
      },
      role: {
        id: "methodist",
        runtime_limits: {
          max_completion_tokens: 1200,
          max_total_tokens: 3000,
          max_response_cost_usd: 0.025,
        },
      },
      task: null,
      handoff_messages: [],
      memory_bundle: null,
    }
  );

  assert.equal(result.completion.status, "failed");
  assert.ok(result.completion.fallback_chain.includes("founder_reply_quality_guard/internal_scope_tag"));
  assert.ok(result.completion.fallback_chain.includes("founder_reply_quality_guard/internal_identifier"));
  assert.doesNotMatch(result.reply_text, /\u0441\u0442\u0430\u0440\u0442\u043e\u0432\u044b\u0439 \u043a\u0430\u0440\u043a\u0430\u0441/i);
  assert.match(result.reply_text, /\u0432\u043d\u0443\u0442\u0440\u0435\u043d\u043d\u0438\u0445 \u0441\u043b\u0443\u0436\u0435\u0431\u043d\u044b\u0445 \u043c\u0430\u0440\u043a\u0435\u0440\u043e\u0432/i);
});
