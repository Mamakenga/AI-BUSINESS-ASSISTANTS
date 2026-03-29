"use strict";

function normalizeOptionalString(value) {
  if (value === undefined || value === null) {
    return null;
  }
  const normalized = String(value).trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeStubConfig(env = process.env) {
  const port = Number.parseInt(env.OPENCLAW_STUB_PORT || "3201", 10);

  return {
    port: Number.isFinite(port) && port > 0 ? port : 3201,
  };
}

function buildStubReplyText(executionContext) {
  const roleId = executionContext?.role_id || executionContext?.role?.id || "assistant";
  const founderRequest = normalizeOptionalString(executionContext?.founder_request) || "No founder request was provided.";
  const taskTitle = normalizeOptionalString(executionContext?.task?.title);

  if (taskTitle) {
    return `[DEMO] ${roleId} processed task "${taskTitle}". Request: ${founderRequest}`;
  }

  return `[DEMO] ${roleId} reply: ${founderRequest}`;
}

function buildStubArtifactContent(executionContext) {
  return {
    summary: buildStubReplyText(executionContext),
    role_id: executionContext?.role_id || executionContext?.role?.id || null,
    founder_request: normalizeOptionalString(executionContext?.founder_request),
    task_id: executionContext?.run?.task_id || null,
    thread_id: executionContext?.run?.thread_id || null,
    source: "openclaw_stub_demo",
  };
}

function buildStubExecutionResponse(executionContext = {}) {
  const outputContract =
    normalizeOptionalString(executionContext.output_contract) ||
    normalizeOptionalString(executionContext?.role?.output_contract);

  return {
    status: "completed",
    model_used: "stub/local-demo",
    fallback_chain: ["stub/local-demo"],
    reply_text: buildStubReplyText(executionContext),
    artifact_type: outputContract,
    artifact_content: buildStubArtifactContent(executionContext),
  };
}

module.exports = {
  buildStubArtifactContent,
  buildStubExecutionResponse,
  buildStubReplyText,
  normalizeStubConfig,
};
