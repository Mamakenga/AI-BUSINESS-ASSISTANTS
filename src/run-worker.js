"use strict";

const { findFounderReplyQualityIssues } = require("./founder-facing-quality");
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

  const compiledPages = Array.isArray(memoryBundle.compiled_pages) ? memoryBundle.compiled_pages : [];
  count += compiledPages.length;

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

function normalizeNonNegativeNumber(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const parsed = Number.parseFloat(String(value));
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }

  return parsed;
}

function buildRuntimeBudgetGuardReply(runRow) {
  if (!runRow || runRow.requested_by_agent === "scheduler") {
    return null;
  }

  return "Не удалось безопасно подготовить ответ в пределах runtime-лимита роли. Попробуйте сузить запрос или разбить его на более узкую задачу.";
}

function buildFounderReplyQualityGuardReply(runRow, issues = []) {
  if (
    runRow?.agent === "methodist" &&
    runRow?.requested_by_agent !== "scheduler" &&
    Array.isArray(issues) &&
    issues.includes("methodist_broad_intake")
  ) {
    return [
      "Подготовил безопасный стартовый каркас вместо широкой анкеты.",
      "",
      "Черновая структура мини-курса:",
      "1. Что такое AI в повседневных сценариях родителей.",
      "2. Где AI реально экономит время, а где нужен человеческий контроль.",
      "3. Как безопасно использовать AI вместе с ребенком без ложных ожиданий.",
      "4. Два-три практических семейных сценария с разбором ошибок.",
      "5. Один следующий шаг для внедрения дома или в школьной коммуникации.",
      "",
      "Что пока остается неясным:",
      "- желаемая длительность;",
      "- онлайн или офлайн формат;",
      "- насколько глубоко нужен практический блок.",
      "",
      "Безопасный следующий шаг:",
      "- подтвердите длительность и формат, и я сразу сожму этот каркас в 3-5 конкретных занятий.",
    ].join("\n");
  }

  if (runRow?.requested_by_agent === "scheduler") {
    return buildScheduledFounderQualityGuardFallback(runRow);
  }

  return "\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u0431\u0435\u0437\u043e\u043f\u0430\u0441\u043d\u043e \u043f\u043e\u0434\u0433\u043e\u0442\u043e\u0432\u0438\u0442\u044c \u043e\u0442\u0432\u0435\u0442 \u0431\u0435\u0437 \u0432\u043d\u0443\u0442\u0440\u0435\u043d\u043d\u0438\u0445 \u0441\u043b\u0443\u0436\u0435\u0431\u043d\u044b\u0445 \u043c\u0430\u0440\u043a\u0435\u0440\u043e\u0432. \u041f\u043e\u043f\u0440\u043e\u0431\u0443\u0439\u0442\u0435 \u043f\u043e\u0432\u0442\u043e\u0440\u0438\u0442\u044c \u0437\u0430\u043f\u0440\u043e\u0441 \u0432 \u0431\u043e\u043b\u0435\u0435 \u0443\u0437\u043a\u043e\u0439 \u0444\u043e\u0440\u043c\u0443\u043b\u0438\u0440\u043e\u0432\u043a\u0435; \u043f\u0440\u043e\u0431\u043b\u0435\u043c\u0430 \u0443\u0436\u0435 \u043e\u0442\u043c\u0435\u0447\u0435\u043d\u0430 quality gate.";
}

function buildScheduledFounderQualityGuardFallback(runRow) {
  const kind = classifyScheduledThinContextRun(runRow);
  const titleByKind = {
    daily_leader_digest: "**Ежедневный бриф для руководителя**",
    weekly_leader_digest: "**Еженедельный дайджест для руководителя**",
    competitor_watch: "**Ежедневный мониторинг конкурентов**",
    branch_finance_review: "**Финансовый обзор филиала**",
    weekly_risk_review: "**Еженедельный обзор рисков**",
  };

  return [
    titleByKind[kind] || "**Плановое обновление**",
    "",
    "**Статус публикации**",
    "- Автоматическая quality-проверка остановила публикацию этого черновика, потому что в нем появились внутренние служебные маркеры.",
    "",
    "**Безопасный следующий шаг**",
    "- Повторите прогон после cleanup служебных маркеров в ответе.",
  ].join("\n");
}

function applyRuntimeUsageLimits(runRow, executionResult, executionContext) {
  if (!executionContext?.role?.runtime_limits || executionResult.status !== "completed") {
    return executionResult;
  }

  const limits = executionContext.role.runtime_limits;
  const violations = [];

  const completionTokens = normalizeNonNegativeNumber(executionResult.completion_tokens);
  if (
    Number.isFinite(limits.max_completion_tokens) &&
    completionTokens !== null &&
    completionTokens > limits.max_completion_tokens
  ) {
    violations.push("completion_tokens");
  }

  const totalTokens = normalizeNonNegativeNumber(executionResult.total_tokens);
  if (Number.isFinite(limits.max_total_tokens) && totalTokens !== null && totalTokens > limits.max_total_tokens) {
    violations.push("total_tokens");
  }

  const responseCostUsd = normalizeNonNegativeNumber(executionResult.response_cost_usd);
  if (
    Number.isFinite(limits.max_response_cost_usd) &&
    responseCostUsd !== null &&
    responseCostUsd > limits.max_response_cost_usd
  ) {
    violations.push("response_cost_usd");
  }

  if (violations.length === 0) {
    return executionResult;
  }

  const markers = Array.from(
    new Set([
      ...(Array.isArray(executionResult.fallback_chain) ? executionResult.fallback_chain : []),
      "runtime_budget_guard",
      ...violations.map((field) => `runtime_budget_guard/${field}`),
    ])
  );

  return {
    ...executionResult,
    status: "failed",
    fallback_chain: markers,
    artifact_type: null,
    artifact_content: null,
    reply_text: buildRuntimeBudgetGuardReply(runRow),
  };
}

function applyFounderFacingQualityGate(runRow, executionResult) {
  if (!runRow || !["founder", "scheduler"].includes(runRow.requested_by_agent)) {
    return executionResult;
  }

  const issues = findFounderReplyQualityIssues(executionResult?.reply_text, {
    roleId: runRow.agent,
  });
  if (issues.length === 0) {
    return executionResult;
  }

  const markers = Array.from(
    new Set([
      ...(Array.isArray(executionResult.fallback_chain) ? executionResult.fallback_chain : []),
      "founder_reply_quality_guard",
      ...issues.map((issue) => `founder_reply_quality_guard/${issue}`),
    ])
  );

  return {
    ...executionResult,
    status: "failed",
    fallback_chain: markers,
    artifact_type: null,
    artifact_content: null,
    reply_text: buildFounderReplyQualityGuardReply(runRow, issues),
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
      runtime_limits: roleProfile.runtime_limits || null,
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

  const enforced = applyRuntimeUsageLimits(runRow, normalized, executionContext);
  const qualityChecked = applyFounderFacingQualityGate(runRow, enforced);

  const completion = {
    actor_agent: runRow.agent,
    status: qualityChecked.status,
    model_used: qualityChecked.model_used,
    fallback_chain: qualityChecked.fallback_chain,
    usage_json: qualityChecked.usage_json,
    prompt_tokens: qualityChecked.prompt_tokens,
    completion_tokens: qualityChecked.completion_tokens,
    total_tokens: qualityChecked.total_tokens,
    response_cost_usd: qualityChecked.response_cost_usd,
  };

  if (runRow.task_id && qualityChecked.status === "completed") {
    completion.artifact_type = qualityChecked.artifact_type;
    completion.artifact_content = qualityChecked.artifact_content;
  }

  return {
    completion,
    reply_text: qualityChecked.reply_text,
  };
}

module.exports = {
  WORKER_ROLE_IDS,
  buildRunCompletionInput,
  buildRunExecutionContext,
  normalizeExecutionResult,
  normalizeWorkerRoleIds,
};
