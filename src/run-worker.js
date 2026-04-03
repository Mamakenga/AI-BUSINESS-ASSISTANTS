"use strict";

const { ROLE_PROFILES } = require("./runtime-profiles");

const WORKER_ROLE_IDS = Object.freeze(
  Object.values(ROLE_PROFILES)
    .filter((profile) => profile.execution_mode !== "memory_service")
    .map((profile) => profile.id)
);

function normalizeOptionalString(value) {
  if (value === undefined || value === null) {
    return null;
  }
  const normalized = String(value).trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeWorkerRoleIds(value) {
  const normalized = normalizeOptionalString(value);
  if (!normalized) {
    return [...WORKER_ROLE_IDS];
  }

  const requested = normalized
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  if (requested.length === 0) {
    return [...WORKER_ROLE_IDS];
  }

  for (const roleId of requested) {
    if (!WORKER_ROLE_IDS.includes(roleId)) {
      throw new Error(`Invalid worker role: ${roleId}`);
    }
  }

  return requested;
}

function countMemoryBundleItems(memoryBundle) {
  if (!memoryBundle || typeof memoryBundle !== "object") {
    return 0;
  }

  const directScopes = ["owner", "business", "role", "task"];
  let count = 0;

  for (const scope of directScopes) {
    const items = Array.isArray(memoryBundle[scope]) ? memoryBundle[scope] : [];
    count += items.length;
  }

  const decisions = memoryBundle.decisions && typeof memoryBundle.decisions === "object" ? memoryBundle.decisions : {};
  for (const scope of ["owner", "business", "task"]) {
    const items = Array.isArray(decisions[scope]) ? decisions[scope] : [];
    count += items.length;
  }

  return count;
}

function classifyScheduledThinContextRun(runRow) {
  if (runRow?.requested_by_agent !== "scheduler") {
    return null;
  }

  const reason = normalizeOptionalString(runRow.dispatch_reason)?.toLowerCase() || "";

  if (runRow?.agent === "assistant") {
    if (reason.includes("daily brief for the leader")) {
      return "daily_leader_digest";
    }
    if (reason.includes("weekly digest for the leader")) {
      return "weekly_leader_digest";
    }
  }

  if (runRow?.agent === "researcher" && reason.includes("competitor watch")) {
    return "competitor_watch";
  }

  if (runRow?.agent === "finance_analyst" && reason.includes("branch finance review")) {
    return "branch_finance_review";
  }

  if (runRow?.agent === "critic" && reason.includes("weekly risk review")) {
    return "weekly_risk_review";
  }

  return null;
}

function hasThinScheduledDigestContext(executionContext) {
  if (!executionContext || !classifyScheduledThinContextRun(executionContext.run)) {
    return false;
  }

  const memoryItemCount = countMemoryBundleItems(executionContext.memory_bundle);
  const hasTask = Boolean(executionContext.task);
  const handoffCount = Array.isArray(executionContext.handoff_messages) ? executionContext.handoff_messages.length : 0;

  return !hasTask && handoffCount === 0 && memoryItemCount === 0;
}

function buildLowContextScheduledDigestFallback(runRow) {
  const kind = classifyScheduledThinContextRun(runRow);
  const sections = {
    confirmed: "**Что подтверждено**",
    unconfirmed: "**Что не подтверждено**",
    nextStep: "**Безопасный следующий шаг**",
  };

  if (kind === "daily_leader_digest" || kind === "weekly_leader_digest") {
    const title =
      kind === "weekly_leader_digest"
        ? "**Еженедельный дайджест для руководителя**"
        : "**Ежедневный бриф для руководителя**";

    return [
      title,
      "",
      sections.confirmed,
      "- В текущем контуре недостаточно подтвержденных данных для содержательного брифа.",
      "",
      sections.unconfirmed,
      "- актуальный статус бизнеса или проекта",
      "- свежие сигналы, решения, риски и блокировки",
      "- приоритетные вопросы, требующие внимания руководителя",
      "",
      sections.nextStep,
      "- Добавьте 1-2 подтвержденных факта о текущем состоянии бизнеса или главной задаче руководителя, после чего бриф станет содержательным.",
    ].join("\n");
  }

  if (kind === "competitor_watch") {
    return [
      "**Ежедневный мониторинг конкурентов**",
      "",
      "**Подтвержденные сигналы конкурентов или рынка**",
      "- В текущем контуре недостаточно подтвержденных конкурентных сигналов для содержательного мониторинга.",
      "",
      "**Почему это важно для нас**",
      "- Пока нет подтвержденных сигналов, на которые можно уверенно опереться для вывода о влиянии на нас.",
      "",
      "**Эскалация**",
      "- Без подтвержденных сигналов пока нечего содержательно эскалировать в другие роли.",
      "",
      "**Рекомендованное следующее действие**",
      "- Зафиксируйте 1-2 подтвержденных сигнала о конкретных конкурентах или каналах наблюдения, после чего мониторинг станет содержательным.",
    ].join("\n");
  }

  if (kind === "branch_finance_review") {
    return [
      "**Финансовый обзор филиала**",
      "",
      "**Аномалии или необычные сдвиги**",
      "- В текущем контуре недостаточно подтвержденных финансовых данных для содержательного обзора.",
      "",
      "**Рискованные тренды в цифрах**",
      "- Без подтвержденных показателей пока нельзя честно выделить рискованные тренды.",
      "",
      "**Что требует эскалации руководителю**",
      "- Без подтвержденных отклонений пока нечего содержательно эскалировать руководителю.",
      "",
      "**Практическая рекомендация**",
      "- Добавьте 1-2 подтвержденных финансовых показателя или отклонения за последний период, после чего обзор станет содержательным.",
    ].join("\n");
  }

  if (kind === "weekly_risk_review") {
    return [
      "**Еженедельный обзор рисков**",
      "",
      "**Противоречия или точки напряжения**",
      "- В текущем контуре недостаточно подтвержденных фактов и артефактов для содержательного обзора рисков.",
      "",
      "**Слабые допущения или хрупкая логика**",
      "- Без подтвержденных решений, артефактов и сигналов пока нельзя честно выделить слабые допущения.",
      "",
      "**Что может стать рискованным следующим**",
      "- Пока нет подтвержденной базы, чтобы уверенно назвать следующий усиливающийся риск.",
      "",
      "**Эскалация или корректирующее действие**",
      "- Добавьте 1-2 подтвержденных решения, допущения или спорных сигнала за неделю, после чего обзор рисков станет содержательным.",
    ].join("\n");
  }

  return [
    "**Плановое обновление**",
    "",
    sections.confirmed,
    "- В текущем контуре недостаточно подтвержденных данных для содержательного обновления.",
    "",
    sections.unconfirmed,
    "- детали, которые должен был охватить этот scheduled run",
    "",
    sections.nextStep,
    "- Добавьте 1-2 подтвержденных факта по нужной теме, после чего scheduled update станет содержательным.",
  ].join("\n");
}

function normalizeExecutionResult(runRow, payload = {}) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Execution response must be an object");
  }

  const status = normalizeOptionalString(payload.status) || "completed";
  if (!["completed", "failed", "canceled"].includes(status)) {
    throw new Error("Invalid execution run status");
  }

  const modelUsed = normalizeOptionalString(payload.model_used);
  const replyText = normalizeOptionalString(payload.reply_text);
  const artifactType = normalizeOptionalString(payload.artifact_type);
  const fallbackChain = payload.fallback_chain === undefined ? [] : payload.fallback_chain;

  if (!Array.isArray(fallbackChain)) {
    throw new Error("Execution fallback_chain must be an array");
  }

  let artifactContent = null;
  if (status === "completed" && runRow.task_id) {
    if (payload.artifact_content && typeof payload.artifact_content === "object" && !Array.isArray(payload.artifact_content)) {
      artifactContent = payload.artifact_content;
    } else {
      artifactContent = {
        reply_text: replyText,
      };
    }
  }

  if (status === "completed" && !runRow.task_id && !replyText) {
    throw new Error("Execution direct-answer response must include reply_text");
  }

  return {
    status,
    model_used: modelUsed,
    fallback_chain: fallbackChain,
    usage_json: payload.usage_json === undefined ? null : payload.usage_json,
    prompt_tokens: payload.prompt_tokens === undefined ? null : payload.prompt_tokens,
    completion_tokens: payload.completion_tokens === undefined ? null : payload.completion_tokens,
    total_tokens: payload.total_tokens === undefined ? null : payload.total_tokens,
    response_cost_usd: payload.response_cost_usd === undefined ? null : payload.response_cost_usd,
    artifact_type: artifactType,
    artifact_content: artifactContent,
    reply_text: replyText,
  };
}

function buildRunExecutionContext(input = {}) {
  const run = input.run;
  if (!run) {
    throw new Error("run is required");
  }

  const roleProfile = ROLE_PROFILES[run.agent];
  if (!roleProfile) {
    throw new Error(`Unknown run agent: ${run.agent}`);
  }

  const messages = Array.isArray(input.messages) ? input.messages : [];
  const founderRequest =
    run.requested_by_agent === "scheduler"
      ? normalizeOptionalString(run.dispatch_reason)
      : [...messages]
          .reverse()
          .find((message) => message.from_agent === "founder" && message.message_type === "request")?.content || null;

  const handoffMessages = messages
    .filter((message) => message.to_agent === run.agent && message.message_type === "handoff")
    .map((message) => ({
      id: message.id,
      content: message.content,
      created_at: message.created_at,
      from_agent: message.from_agent,
    }));

  return {
    run: {
      id: run.id,
      agent: run.agent,
      task_id: run.task_id,
      thread_id: run.thread_id,
      requested_by_agent: run.requested_by_agent,
      dispatch_reason: run.dispatch_reason,
      created_at: run.created_at,
    },
    role: {
      id: roleProfile.id,
      execution_mode: roleProfile.execution_mode,
      preferred_models: [...roleProfile.preferred_models],
      model_alias: roleProfile.model_alias,
      output_contract: roleProfile.output_contract,
    },
    task: input.task
      ? {
          id: input.task.id,
          title: input.task.title,
          status: input.task.status,
          assigned_role: input.task.assigned_role,
          priority: input.task.priority,
          due_at: input.task.due_at,
          thread_id: input.task.thread_id,
        }
      : null,
    founder_request: founderRequest,
    handoff_messages: handoffMessages,
    memory_bundle: input.memory_bundle || null,
  };
}

function buildRunCompletionInput(runRow, executionResult, executionContext = null) {
  const normalized = normalizeExecutionResult(runRow, executionResult);

  if (hasThinScheduledDigestContext(executionContext) && normalized.status === "completed") {
    normalized.reply_text = buildLowContextScheduledDigestFallback(runRow);
    normalized.fallback_chain = [...normalized.fallback_chain, "scheduled_empty_context_guard"];
  }

  const completion = {
    actor_agent: runRow.agent,
    status: normalized.status,
    model_used: normalized.model_used,
    fallback_chain: normalized.fallback_chain,
    usage_json: normalized.usage_json,
    prompt_tokens: normalized.prompt_tokens,
    completion_tokens: normalized.completion_tokens,
    total_tokens: normalized.total_tokens,
    response_cost_usd: normalized.response_cost_usd,
  };

  if (runRow.task_id && normalized.status === "completed") {
    completion.artifact_type = normalized.artifact_type;
    completion.artifact_content = normalized.artifact_content;
  }

  return {
    completion,
    reply_text: normalized.reply_text,
  };
}

module.exports = {
  WORKER_ROLE_IDS,
  buildRunCompletionInput,
  buildRunExecutionContext,
  normalizeExecutionResult,
  normalizeWorkerRoleIds,
};
