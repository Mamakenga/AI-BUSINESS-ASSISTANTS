"use strict";

const { ROLE_PROFILES } = require("./runtime-profiles");

const TERMINAL_RUN_STATUSES = new Set(["completed", "failed", "canceled"]);

function normalizeRequiredString(value, fieldName) {
  const normalized = String(value || "").trim();
  if (!normalized) {
    throw new Error(`${fieldName} is required`);
  }
  return normalized;
}

function normalizeOptionalString(value) {
  const normalized = String(value || "").trim();
  return normalized.length > 0 ? normalized : null;
}

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

  const modelUsed = normalizeOptionalString(input.model_used);
  const fallbackChain = normalizeFallbackChain(input.fallback_chain);
  const artifactContent = normalizeArtifactContent(input.artifact_content);

  if (status === "completed" && runRow.task_id && artifactContent === undefined) {
    throw new Error("artifact_content is required for task-bound completed runs");
  }

  const roleProfile = ROLE_PROFILES[runRow.agent];
  const artifactType =
    status === "completed" && runRow.task_id
      ? normalizeOptionalString(input.artifact_type) || roleProfile.output_contract
      : null;

  return {
    run_update: {
      status,
      model_used: modelUsed,
      fallback_chain: fallbackChain === undefined ? runRow.fallback_chain || [] : fallbackChain,
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
