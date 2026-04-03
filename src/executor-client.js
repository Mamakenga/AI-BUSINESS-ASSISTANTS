"use strict";

const { buildExecutionMessages } = require("./system-prompts");

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

function normalizeLiteLLMConfig(env = process.env) {
  const baseUrl = normalizeRequiredString(env.LITELLM_BASE_URL, "LITELLM_BASE_URL").replace(/\/+$/, "");
  const apiKey = normalizeOptionalString(env.LITELLM_API_KEY || env.LITELLM_MASTER_KEY);
  const timeoutMs = Number.parseInt(env.LITELLM_TIMEOUT_MS || "60000", 10);

  return {
    base_url: baseUrl,
    api_key: apiKey,
    timeout_ms: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 60000,
  };
}

function createExecutorError(message, details = {}) {
  const error = new Error(message);
  error.name = "ExecutorClientError";
  error.executor = {
    retryable: Boolean(details.retryable),
    reason: details.reason || "executor_error",
    provider: normalizeOptionalString(details.provider) || "litellm",
    model_alias: normalizeOptionalString(details.model_alias),
    upstream_status: Number.isFinite(details.upstream_status) ? details.upstream_status : null,
    raw_fragment: normalizeOptionalString(details.raw_fragment),
  };
  return error;
}

function resolveModelAlias(executionContext) {
  const alias = normalizeOptionalString(executionContext?.role?.model_alias);
  if (!alias) {
    throw new Error("executionContext.role.model_alias is required");
  }

  return alias;
}

function buildExecutorRequest(executionContext) {
  if (!executionContext || typeof executionContext !== "object") {
    throw new Error("executionContext is required");
  }

  const { messages, prompt_meta } = buildExecutionMessages(executionContext);

  return {
    model: resolveModelAlias(executionContext),
    messages,
    metadata: {
      role_id: executionContext.role.id,
      run_id: executionContext.run?.id || null,
      task_id: executionContext.run?.task_id || null,
      thread_id: executionContext.run?.thread_id || null,
      request_type: prompt_meta.request_type,
    },
    stream: false,
  };
}

function extractAssistantText(payload) {
  const choice = Array.isArray(payload?.choices) ? payload.choices[0] : null;
  const message = choice?.message;
  const content = message?.content;

  if (typeof content === "string" && content.trim()) {
    return content.trim();
  }

  if (Array.isArray(content)) {
    const text = content
      .map((part) => {
        if (typeof part === "string") {
          return part;
        }
        if (part && typeof part === "object" && typeof part.text === "string") {
          return part.text;
        }
        return "";
      })
      .join("")
      .trim();

    if (text) {
      return text;
    }
  }

  return null;
}

function normalizeUsageObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value;
}

function normalizeNonNegativeInteger(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }
  return parsed;
}

function normalizeNonNegativeDecimal(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  const parsed = Number.parseFloat(String(value));
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }
  return parsed;
}

function extractResponseCostUsd(payload) {
  return (
    normalizeNonNegativeDecimal(payload?.response_cost_usd) ??
    normalizeNonNegativeDecimal(payload?.response_cost) ??
    normalizeNonNegativeDecimal(payload?._hidden_params?.response_cost)
  );
}

function extractUsageTelemetry(payload) {
  const usage = normalizeUsageObject(payload?.usage);
  return {
    usage_json: usage,
    prompt_tokens: normalizeNonNegativeInteger(usage?.prompt_tokens),
    completion_tokens: normalizeNonNegativeInteger(usage?.completion_tokens),
    total_tokens: normalizeNonNegativeInteger(usage?.total_tokens),
    response_cost_usd: extractResponseCostUsd(payload),
  };
}

function normalizeExecutorResponse(payload, executionContext, request) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Executor response must be an object");
  }

  const replyText = extractAssistantText(payload);
  if (!replyText) {
    throw new Error("Executor response must include assistant text");
  }

  const telemetry = extractUsageTelemetry(payload);

  return {
    status: "completed",
    model_used: normalizeOptionalString(payload.model) || request.model,
    fallback_chain: [],
    usage_json: telemetry.usage_json,
    prompt_tokens: telemetry.prompt_tokens,
    completion_tokens: telemetry.completion_tokens,
    total_tokens: telemetry.total_tokens,
    response_cost_usd: telemetry.response_cost_usd,
    reply_text: replyText,
    artifact_type: executionContext.role.output_contract,
    artifact_content: executionContext.run?.task_id
      ? {
          reply_text: replyText,
          source: "litellm_executor_v1",
          usage: telemetry.usage_json,
          response_cost_usd: telemetry.response_cost_usd,
        }
      : null,
  };
}

function parseResponsePayload(text) {
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch (error) {
    throw createExecutorError("Executor returned malformed JSON", {
      reason: "normalization_error",
      raw_fragment: text.slice(0, 500),
    });
  }
}

function tryParseResponsePayload(text) {
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch (_error) {
    return null;
  }
}

function buildRawFragment(text, payload) {
  const payloadMessage = normalizeOptionalString(payload?.error?.message);
  if (payloadMessage) {
    return payloadMessage.slice(0, 500);
  }

  return text.slice(0, 500);
}

async function executeRoleRun(executionContext, options = {}) {
  const config = options.config || normalizeLiteLLMConfig(options.env);
  const fetchImpl = options.fetchImpl || fetch;
  const request = buildExecutorRequest(executionContext);
  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), config.timeout_ms);

  try {
    let response;
    try {
      response = await fetchImpl(`${config.base_url}/chat/completions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(config.api_key ? { authorization: `Bearer ${config.api_key}` } : {}),
        },
        body: JSON.stringify(request),
        signal: abortController.signal,
      });
    } catch (error) {
      if (error?.name === "AbortError") {
        throw createExecutorError("Executor request timed out", {
          retryable: true,
          reason: "timeout",
          model_alias: request.model,
        });
      }

      throw createExecutorError("Executor transport request failed", {
        retryable: true,
        reason: "transport_error",
        model_alias: request.model,
        raw_fragment: error?.message,
      });
    }

    if (!response.ok) {
      const status = response.status;
      const text = await response.text();
      const payload = tryParseResponsePayload(text);
      const rawFragment = buildRawFragment(text, payload);
      if (status === 429) {
        throw createExecutorError("Executor request was rate limited", {
          retryable: true,
          reason: "rate_limit",
          model_alias: request.model,
          upstream_status: status,
          raw_fragment: rawFragment,
        });
      }

      if (status >= 500) {
        throw createExecutorError("Executor upstream returned a server error", {
          retryable: true,
          reason: "upstream_5xx",
          model_alias: request.model,
          upstream_status: status,
          raw_fragment: rawFragment,
        });
      }

      throw createExecutorError("Executor request was rejected", {
        retryable: false,
        reason: "invalid_request",
        model_alias: request.model,
        upstream_status: status,
        raw_fragment: rawFragment,
      });
    }

    const text = await response.text();
    const payload = parseResponsePayload(text);

    try {
      return normalizeExecutorResponse(payload, executionContext, request);
    } catch (error) {
      if (error?.name === "ExecutorClientError") {
        throw error;
      }

      throw createExecutorError(error.message, {
        retryable: false,
        reason: "normalization_error",
        model_alias: request.model,
        raw_fragment: text.slice(0, 500),
      });
    }
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = {
  buildExecutorRequest,
  createExecutorError,
  executeRoleRun,
  normalizeExecutorResponse,
  normalizeLiteLLMConfig,
  resolveModelAlias,
};
