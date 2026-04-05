"use strict";

const { ROLE_PROFILES } = require("./runtime-profiles");
const { normalizeLooseOptionalString, normalizeRequiredString } = require("./string-normalizers");

const TERMINAL_RUN_STATUSES = new Set(["completed", "failed", "canceled"]);

function normalizeFallbackChain(value) {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new Error("fallback_chain must be an array");
  }
  return value;
}

function normalizeArtifactContent(value) {
  if (value === undefined) {
    return undefined;
  }
  if (value === null || Array.isArray(value) || typeof value !== "object") {
    throw new Error("artifact_content must be an object");
  }
  return value;
}

function normalizeOptionalInteger(value, fieldName) {
  if (value === undefined) {
    return undefined;
  }
  if (value === null || value === "") {
    return null;
  }
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${fieldName} must be a non-negative integer`);
  }
  return parsed;
}

function normalizeOptionalDecimal(value, fieldName) {
  if (value === undefined) {
    return undefined;
  }
  if (value === null || value === "") {
    return null;
  }
  const parsed = Number.parseFloat(String(value));
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${fieldName} must be a non-negative number`);
  }
  return parsed;
}

function normalizeUsageJson(value) {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  if (Array.isArray(value) || typeof value !== "object") {
    throw new Error("usage_json must be an object");
  }
  return value;
}

function buildRunCompletion(input, runRow) {
  if (!runRow) {
    throw new Error("run_row is required");
  }

  if (TERMINAL_RUN_STATUSES.has(runRow.status)) {
    throw new Error("Run already in terminal state");
  }

  const actorAgent = normalizeRequiredString(input.actor_agent, "actor_agent");
  if (actorAgent !== runRow.agent) {
    throw new Error("Only the assigned role can complete this run");
  }

  const status = normalizeRequiredString(input.status, "status");
  if (!TERMINAL_RUN_STATUSES.has(status)) {
    throw new Error("Invalid run status");
  }

  const modelUsed = normalizeLooseOptionalString(input.model_used);
  const fallbackChain = normalizeFallbackChain(input.fallback_chain);
  const artifactContent = normalizeArtifactContent(input.artifact_content);
  const usageJson = normalizeUsageJson(input.usage_json);
  const promptTokens = normalizeOptionalInteger(input.prompt_tokens, "prompt_tokens");
  const completionTokens = normalizeOptionalInteger(input.completion_tokens, "completion_tokens");
  const totalTokens = normalizeOptionalInteger(input.total_tokens, "total_tokens");
  const responseCostUsd = normalizeOptionalDecimal(input.response_cost_usd, "response_cost_usd");

  if (status === "completed" && runRow.task_id && artifactContent === undefined) {
    throw new Error("artifact_content is required for task-bound completed runs");
  }

  const roleProfile = ROLE_PROFILES[runRow.agent];
  const artifactType =
    status === "completed" && runRow.task_id
      ? normalizeLooseOptionalString(input.artifact_type) || roleProfile.output_contract
      : null;

  return {
    run_update: {
      status,
      model_used: modelUsed,
      fallback_chain: fallbackChain === undefined ? runRow.fallback_chain || [] : fallbackChain,
      usage_json: usageJson === undefined ? runRow.usage_json ?? null : usageJson,
      prompt_tokens: promptTokens === undefined ? runRow.prompt_tokens ?? null : promptTokens,
      completion_tokens: completionTokens === undefined ? runRow.completion_tokens ?? null : completionTokens,
      total_tokens: totalTokens === undefined ? runRow.total_tokens ?? null : totalTokens,
      response_cost_usd: responseCostUsd === undefined ? runRow.response_cost_usd ?? null : responseCostUsd,
    },
    artifact:
      status === "completed" && runRow.task_id
        ? {
            task_id: runRow.task_id,
            artifact_type: artifactType,
            created_by: runRow.agent,
            content: artifactContent,
          }
        : null,
  };
}

module.exports = {
  TERMINAL_RUN_STATUSES,
  buildRunCompletion,
};
