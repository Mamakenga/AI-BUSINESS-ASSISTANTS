"use strict";

function normalizeRequiredString(value, fieldName) {
  const normalized = String(value || "").trim();
  if (!normalized) {
    throw new Error(`${fieldName} is required`);
  }
  return normalized;
}

function normalizeOptionalString(value) {
  if (value === undefined || value === null) {
    return null;
  }
  const normalized = String(value).trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeOpenClawConfig(env = process.env) {
  const executeUrl = normalizeRequiredString(env.OPENCLAW_EXECUTE_URL, "OPENCLAW_EXECUTE_URL");
  const apiKey = normalizeOptionalString(env.OPENCLAW_API_KEY);
  const timeoutMs = Number.parseInt(env.OPENCLAW_TIMEOUT_MS || "60000", 10);

  return {
    execute_url: executeUrl,
    api_key: apiKey,
    timeout_ms: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 60000,
  };
}

function buildOpenClawExecutePayload(executionContext) {
  if (!executionContext || typeof executionContext !== "object") {
    throw new Error("executionContext is required");
  }

  return {
    role_id: executionContext.role.id,
    execution_mode: executionContext.role.execution_mode,
    preferred_models: executionContext.role.preferred_models,
    output_contract: executionContext.role.output_contract,
    run: executionContext.run,
    task: executionContext.task,
    founder_request: executionContext.founder_request,
    handoff_messages: executionContext.handoff_messages,
    memory_bundle: executionContext.memory_bundle,
  };
}

async function executeOpenClawRun(executionContext, options = {}) {
  const config = options.config || normalizeOpenClawConfig(options.env);
  const fetchImpl = options.fetchImpl || fetch;
  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), config.timeout_ms);

  try {
    const response = await fetchImpl(config.execute_url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(config.api_key ? { authorization: `Bearer ${config.api_key}` } : {}),
      },
      body: JSON.stringify(buildOpenClawExecutePayload(executionContext)),
      signal: abortController.signal,
    });

    const text = await response.text();
    const payload = text ? JSON.parse(text) : null;

    if (!response.ok) {
      throw new Error(`OpenClaw execute failed: ${response.status} ${text}`);
    }

    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new Error("OpenClaw response must be an object");
    }

    return payload;
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = {
  buildOpenClawExecutePayload,
  executeOpenClawRun,
  normalizeOpenClawConfig,
};
