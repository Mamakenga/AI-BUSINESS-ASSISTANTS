"use strict";

const assert = require("node:assert/strict");
const process = require("node:process");

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

function normalizeSmokeConfig(env = process.env) {
  const timeoutMs = Number.parseInt(env.SMOKE_LITELLM_TIMEOUT_MS || env.LITELLM_TIMEOUT_MS || "60000", 10);
  const expectedText = normalizeRequiredString(env.SMOKE_LITELLM_EXPECT_TEXT || "OK", "SMOKE_LITELLM_EXPECT_TEXT");

  return {
    base_url: normalizeRequiredString(env.LITELLM_BASE_URL, "LITELLM_BASE_URL").replace(/\/+$/, ""),
    api_key: normalizeOptionalString(env.LITELLM_API_KEY || env.LITELLM_MASTER_KEY),
    model: normalizeRequiredString(env.SMOKE_LITELLM_MODEL || "assistant-model", "SMOKE_LITELLM_MODEL"),
    prompt: normalizeRequiredString(env.SMOKE_LITELLM_PROMPT || "Reply with exactly: OK", "SMOKE_LITELLM_PROMPT"),
    expected_text: expectedText,
    timeout_ms: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 60000,
  };
}

function tryParseJson(text) {
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch (_error) {
    return null;
  }
}

async function litellmRequest(config, pathname, body, options = {}) {
  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), config.timeout_ms);
  const fetchImpl = options.fetchImpl || fetch;

  try {
    const response = await fetchImpl(`${config.base_url}${pathname}`, {
      method: body ? "POST" : "GET",
      headers: {
        ...(body ? { "content-type": "application/json" } : {}),
        ...(config.api_key ? { authorization: `Bearer ${config.api_key}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: abortController.signal,
    });

    const text = await response.text();

    if (!response.ok) {
      throw new Error(`${pathname} failed with ${response.status}: ${text || "<empty response>"}`);
    }

    const payload = tryParseJson(text);
    if (text && payload === null) {
      throw new Error(`Expected JSON from ${pathname}, got: ${text}`);
    }

    return payload;
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(`LiteLLM smoke timed out after ${config.timeout_ms}ms`);
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function extractAssistantText(payload) {
  const choice = Array.isArray(payload?.choices) ? payload.choices[0] : null;
  const content = choice?.message?.content;

  if (typeof content === "string" && content.trim()) {
    return content.trim();
  }

  if (Array.isArray(content)) {
    return content
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
  }

  return null;
}

async function main() {
  const config = normalizeSmokeConfig();

  console.log(`[smoke-litellm] checking models via ${config.base_url}/v1/models`);
  const modelsPayload = await litellmRequest(config, "/v1/models");
  assert.ok(Array.isArray(modelsPayload?.data), "LiteLLM models response must contain data[]");
  assert.ok(
    modelsPayload.data.some((item) => item?.id === config.model),
    `LiteLLM model alias ${config.model} is not exposed by /v1/models`
  );

  console.log(`[smoke-litellm] checking chat completion via model ${config.model}`);
  const completionPayload = await litellmRequest(config, "/chat/completions", {
    model: config.model,
    messages: [
      {
        role: "system",
        content: "You are a smoke test assistant. Follow the user request exactly.",
      },
      {
        role: "user",
        content: config.prompt,
      },
    ],
    stream: false,
    max_tokens: 32,
  });

  const assistantText = extractAssistantText(completionPayload);
  assert.ok(assistantText, "LiteLLM completion did not return assistant text");
  assert.equal(
    assistantText,
    config.expected_text,
    `LiteLLM completion did not match expected smoke text: expected "${config.expected_text}", got "${assistantText}"`
  );

  console.log("[smoke-litellm] models ok");
  console.log(`[smoke-litellm] completion ok: ${assistantText}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error("[smoke-litellm] failed", error);
    process.exitCode = 1;
  });
}

module.exports = {
  extractAssistantText,
  litellmRequest,
  normalizeSmokeConfig,
  tryParseJson,
};
