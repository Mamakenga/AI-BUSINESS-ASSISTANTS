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
    [...messages]
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

function buildRunCompletionInput(runRow, executionResult) {
  const normalized = normalizeExecutionResult(runRow, executionResult);

  const completion = {
    actor_agent: runRow.agent,
    status: normalized.status,
    model_used: normalized.model_used,
    fallback_chain: normalized.fallback_chain,
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
