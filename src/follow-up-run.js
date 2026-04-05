"use strict";

const { ROLE_PROFILES } = require("./runtime-profiles");
const { normalizeLooseOptionalString, normalizeRequiredString } = require("./string-normalizers");

const FOLLOW_UP_TARGET_ROLE_IDS = new Set(
  Object.values(ROLE_PROFILES)
    .filter((profile) => profile.execution_mode === "single_role_worker" || profile.execution_mode === "review_worker")
    .map((profile) => profile.id)
);

function buildHandoffMessage(sourceAgent, targetAgent, taskId, threadId, dispatchReason, input) {
  const handoffContent =
    normalizeLooseOptionalString(input.handoff_message) ||
    dispatchReason ||
    "Follow-up requested by orchestrator.";

  return {
    thread_id: threadId,
    task_id: taskId,
    from_agent: sourceAgent,
    to_agent: targetAgent,
    message_type: "handoff",
    content: handoffContent,
    status: "unread",
  };
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

  const dispatchReason = normalizeLooseOptionalString(input.dispatch_reason);

  return {
    run: {
      agent: targetAgent,
      task_id: taskId,
      thread_id: threadId,
      status: "pending",
      requested_by_agent: "orchestrator",
      dispatch_reason: dispatchReason,
    },
    handoff_message: buildHandoffMessage(sourceAgent, targetAgent, taskId, threadId, dispatchReason, input),
  };
}

module.exports = {
  FOLLOW_UP_TARGET_ROLE_IDS,
  buildFollowUpRun,
};
