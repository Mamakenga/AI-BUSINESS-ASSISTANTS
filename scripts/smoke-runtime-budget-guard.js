"use strict";

const { buildExecutorRequest } = require("../src/executor-client");
const { buildRunCompletionInput } = require("../src/run-worker");
const { ROLE_PROFILES } = require("../src/runtime-profiles");

function normalizeOptionalString(value) {
  if (value === undefined || value === null) {
    return null;
  }
  const normalized = String(value).trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeRequiredScenario(value) {
  const normalized = normalizeOptionalString(value) || "founder_direct";
  if (!["founder_direct", "founder_task", "scheduled"].includes(normalized)) {
    throw new Error(`Unknown SMOKE_BUDGET_SCENARIO: ${normalized}`);
  }
  return normalized;
}

function normalizePositiveNumber(value, fallback) {
  const parsed = Number.parseFloat(String(value || ""));
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function normalizeBudgetSmokeConfig(env = process.env) {
  return {
    scenario: normalizeRequiredScenario(env.SMOKE_BUDGET_SCENARIO),
    completion_tokens:
      normalizePositiveNumber(env.SMOKE_BUDGET_COMPLETION_TOKENS, Number.NaN),
    total_tokens:
      normalizePositiveNumber(env.SMOKE_BUDGET_TOTAL_TOKENS, Number.NaN),
    response_cost_usd:
      normalizePositiveNumber(env.SMOKE_BUDGET_RESPONSE_COST_USD, Number.NaN),
  };
}

function buildScenarioExecutionContext(scenario) {
  if (scenario === "founder_task") {
    return {
      run: {
        id: 902,
        agent: "researcher",
        task_id: "task_smoke_budget_01",
        thread_id: "thread_smoke_budget_01",
        requested_by_agent: "founder",
        dispatch_reason: null,
      },
      role: {
        id: "researcher",
        execution_mode: "single_role_worker",
        preferred_models: [...ROLE_PROFILES.researcher.preferred_models],
        model_alias: ROLE_PROFILES.researcher.model_alias,
        runtime_limits: ROLE_PROFILES.researcher.runtime_limits,
        output_contract: ROLE_PROFILES.researcher.output_contract,
      },
      task: {
        id: "task_smoke_budget_01",
        title: "Собрать свежие сигналы по конкурентам",
      },
      founder_request: "@researcher есть ли свежие сигналы?",
      handoff_messages: [],
      memory_bundle: null,
    };
  }

  if (scenario === "scheduled") {
    return {
      run: {
        id: 903,
        agent: "assistant",
        task_id: null,
        thread_id: null,
        requested_by_agent: "scheduler",
        dispatch_reason: "Prepare the daily brief for the leader in Russian.",
      },
      role: {
        id: "assistant",
        execution_mode: "single_role_worker",
        preferred_models: [...ROLE_PROFILES.assistant.preferred_models],
        model_alias: ROLE_PROFILES.assistant.model_alias,
        runtime_limits: ROLE_PROFILES.assistant.runtime_limits,
        output_contract: ROLE_PROFILES.assistant.output_contract,
      },
      task: null,
      founder_request: "Prepare the daily brief for the leader in Russian.",
      handoff_messages: [],
      memory_bundle: {
        business: [{ fact: "Есть подтвержденный факт для scheduled smoke." }],
      },
    };
  }

  return {
    run: {
      id: 901,
      agent: "assistant",
      task_id: null,
      thread_id: "thread_smoke_budget_direct",
      requested_by_agent: "founder",
      dispatch_reason: null,
    },
    role: {
      id: "assistant",
      execution_mode: "single_role_worker",
      preferred_models: [...ROLE_PROFILES.assistant.preferred_models],
      model_alias: ROLE_PROFILES.assistant.model_alias,
      runtime_limits: ROLE_PROFILES.assistant.runtime_limits,
      output_contract: ROLE_PROFILES.assistant.output_contract,
    },
    task: null,
    founder_request: "@assistant дай краткий апдейт",
    handoff_messages: [],
    memory_bundle: null,
  };
}

function buildOverBudgetExecutionResult(executionContext, config) {
  const limits = executionContext.role.runtime_limits;

  return {
    status: "completed",
    model_used: executionContext.role.model_alias,
    fallback_chain: [],
    completion_tokens:
      Number.isFinite(config.completion_tokens) ? config.completion_tokens : limits.max_completion_tokens + 50,
    total_tokens:
      Number.isFinite(config.total_tokens) ? config.total_tokens : limits.max_total_tokens + 100,
    response_cost_usd:
      Number.isFinite(config.response_cost_usd) ? config.response_cost_usd : limits.max_response_cost_usd + 0.005,
    reply_text: "Over-budget smoke reply.",
    artifact_content: executionContext.run.task_id ? { summary: "Over-budget artifact." } : null,
  };
}

function runBudgetGuardSmoke(options = {}) {
  const config = normalizeBudgetSmokeConfig(options.env || process.env);
  const executionContext = buildScenarioExecutionContext(config.scenario);
  const executorRequest = buildExecutorRequest(executionContext);
  const executionResult = buildOverBudgetExecutionResult(executionContext, config);
  const outcome = buildRunCompletionInput(executionContext.run, executionResult, executionContext);

  const markers = outcome.completion.fallback_chain || [];
  if (!markers.includes("runtime_budget_guard")) {
    throw new Error("runtime budget guard marker is missing");
  }
  if (outcome.completion.status !== "failed") {
    throw new Error(`expected failed completion status, got ${outcome.completion.status}`);
  }
  if (executorRequest.max_tokens !== executionContext.role.runtime_limits.max_completion_tokens) {
    throw new Error("executor request max_tokens does not match role runtime limit");
  }

  if (config.scenario === "scheduled" && outcome.reply_text !== null) {
    throw new Error("scheduled budget guard smoke expected reply_text to be suppressed");
  }

  if (config.scenario !== "scheduled" && !normalizeOptionalString(outcome.reply_text)) {
    throw new Error("founder-facing budget guard smoke expected a safe reply");
  }

  const summary = {
    scenario: config.scenario,
    role_id: executionContext.role.id,
    request_max_tokens: executorRequest.max_tokens || null,
    limits: executionContext.role.runtime_limits,
    over_budget: {
      completion_tokens: executionResult.completion_tokens,
      total_tokens: executionResult.total_tokens,
      response_cost_usd: executionResult.response_cost_usd,
    },
    completion_status: outcome.completion.status,
    fallback_chain: outcome.completion.fallback_chain,
    reply_text: outcome.reply_text,
  };

  console.log(`[smoke-runtime-budget-guard] scenario ok: ${summary.scenario}`);
  console.log(JSON.stringify(summary, null, 2));
  return summary;
}

function main() {
  runBudgetGuardSmoke();
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error("[smoke-runtime-budget-guard] failed", error);
    process.exit(1);
  }
}

module.exports = {
  buildOverBudgetExecutionResult,
  buildScenarioExecutionContext,
  normalizeBudgetSmokeConfig,
  runBudgetGuardSmoke,
};
