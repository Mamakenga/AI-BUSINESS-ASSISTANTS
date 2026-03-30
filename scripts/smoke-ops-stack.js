"use strict";

const assert = require("node:assert/strict");
const process = require("node:process");

const { litellmRequest, normalizeSmokeConfig } = require("./smoke-litellm");

function normalizeRequiredString(value, fieldName) {
  const normalized = String(value || "").trim();
  if (!normalized) {
    throw new Error(`${fieldName} is required`);
  }
  return normalized;
}

function normalizeOpsSmokeConfig(env = process.env) {
  const timeoutMs = Number.parseInt(env.SMOKE_CONTROL_API_TIMEOUT_MS || "15000", 10);

  return {
    control_api_url: normalizeRequiredString(env.SMOKE_CONTROL_API_URL || env.CONTROL_API_URL, "CONTROL_API_URL").replace(/\/+$/, ""),
    timeout_ms: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 15000,
    litellm: normalizeSmokeConfig(env),
  };
}

async function requestJson(url, options = {}) {
  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), options.timeout_ms || 15000);
  const fetchImpl = options.fetchImpl || fetch;

  try {
    const response = await fetchImpl(url, {
      method: "GET",
      signal: abortController.signal,
    });

    const text = await response.text();
    if (!response.ok) {
      throw new Error(`GET ${url} failed with ${response.status}: ${text || "<empty response>"}`);
    }

    if (!text) {
      throw new Error(`GET ${url} returned empty body`);
    }

    try {
      return JSON.parse(text);
    } catch (_error) {
      throw new Error(`GET ${url} returned non-JSON body: ${text}`);
    }
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(`Control API smoke timed out after ${options.timeout_ms || 15000}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function runOpsStackSmoke(options = {}) {
  const env = options.env || process.env;
  const config = options.config || normalizeOpsSmokeConfig(env);
  const fetchImpl = options.fetchImpl || fetch;

  console.log(`[smoke-ops-stack] checking control API via ${config.control_api_url}/health`);
  const healthPayload = await requestJson(`${config.control_api_url}/health`, {
    timeout_ms: config.timeout_ms,
    fetchImpl,
  });

  assert.equal(healthPayload?.ok, true, "Control API health must return ok=true");
  assert.equal(healthPayload?.service, "control-api", "Control API health must identify service=control-api");

  console.log("[smoke-ops-stack] control API ok");
  await litellmRequest(config.litellm, "/v1/models", null, { fetchImpl });
  console.log("[smoke-ops-stack] LiteLLM models ok");
}

async function main() {
  const config = normalizeOpsSmokeConfig();
  await runOpsStackSmoke({ config });
  console.log("[smoke-ops-stack] pre-Telegram stack smoke passed");
}

if (require.main === module) {
  main().catch((error) => {
    console.error("[smoke-ops-stack] failed", error);
    process.exitCode = 1;
  });
}

module.exports = {
  normalizeOpsSmokeConfig,
  requestJson,
  runOpsStackSmoke,
};
