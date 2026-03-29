"use strict";

const { ROLE_PROFILES } = require("./runtime-profiles");

const FOLLOW_UP_TARGET_ROLE_IDS = new Set(
  Object.values(ROLE_PROFILES)
    .filter((profile) => profile.execution_mode === "single_role_worker" || profile.execution_mode === "review_worker")
    .map((profile) => profile.id)
);

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

function buildFollowUpRun(input) {
  const sourceAgent = normalizeRequiredString(input.source_agent, "source_agent");
  if (sourceAgent !== "orchestrator") {
    throw new Error("Only orchestrator can create follow-up runs");
  }

  const taskId = normalizeRequiredString(input.task_id, "task_id");
  const threadId = normalizeRequiredString(input.thread_id, "thread_id");
  const targetAgent = normalizeRequiredString(input.target_agent, "target_agent");

  if (!FOLLOW_UP_TARGET_ROLE_IDS.has(targetAgent)) {
    throw new Error("Invalid follow-up target_agent");
  }

  return {
    agent: targetAgent,
    task_id: taskId,
    thread_id: threadId,
    status: "pending",
    requested_by_agent: "orchestrator",
    dispatch_reason: normalizeOptionalString(input.dispatch_reason),
  };
}

module.exports = {
  FOLLOW_UP_TARGET_ROLE_IDS,
  buildFollowUpRun,
};
