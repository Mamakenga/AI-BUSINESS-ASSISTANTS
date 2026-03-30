"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

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

function parseEnvFile(text) {
  const result = {};

  for (const rawLine of String(text || "").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();
    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }

  return result;
}

function readEnvFile(filePath) {
  return parseEnvFile(fs.readFileSync(filePath, "utf8"));
}

function normalizePreflightConfig(env = process.env) {
  return {
    worker_env_path: normalizeRequiredString(env.SMOKE_WORKER_ENV_PATH || "/etc/ops.env", "SMOKE_WORKER_ENV_PATH"),
    gateway_env_path: normalizeRequiredString(
      env.SMOKE_LITELLM_ENV_PATH || "/home/ops/.env.ops-litellm",
      "SMOKE_LITELLM_ENV_PATH"
    ),
  };
}

function getWorkerGatewaySecret(workerEnv) {
  return normalizeOptionalString(workerEnv.LITELLM_API_KEY || workerEnv.LITELLM_MASTER_KEY);
}

function validatePreflight(workerEnv, gatewayEnv) {
  const requiredWorkerFields = [
    "DATABASE_URL",
    "PORT",
    "CONTROL_API_URL",
    "TELEGRAM_BOT_TOKEN",
    "TELEGRAM_ALLOWED_CHAT_ID",
    "LITELLM_BASE_URL",
  ];
  const requiredGatewayFields = ["LITELLM_MASTER_KEY", "OPENAI_API_KEY", "ANTHROPIC_API_KEY", "GEMINI_API_KEY"];

  for (const field of requiredWorkerFields) {
    assert.ok(normalizeOptionalString(workerEnv[field]), `worker env missing ${field}`);
  }

  for (const field of requiredGatewayFields) {
    assert.ok(normalizeOptionalString(gatewayEnv[field]), `gateway env missing ${field}`);
  }

  const workerSecret = getWorkerGatewaySecret(workerEnv);
  const gatewaySecret = normalizeRequiredString(gatewayEnv.LITELLM_MASTER_KEY, "LITELLM_MASTER_KEY");

  assert.ok(workerSecret, "worker env missing LiteLLM auth secret");
  assert.equal(workerSecret, gatewaySecret, "worker LiteLLM auth secret does not match gateway master key");
  assert.equal(
    normalizeRequiredString(workerEnv.LITELLM_BASE_URL, "LITELLM_BASE_URL"),
    "http://127.0.0.1:4000",
    "worker LITELLM_BASE_URL must point to local LiteLLM gateway"
  );
}

async function main() {
  const config = normalizePreflightConfig();

  console.log(`[smoke-ops-preflight] reading worker env from ${config.worker_env_path}`);
  const workerEnv = readEnvFile(config.worker_env_path);
  console.log(`[smoke-ops-preflight] reading gateway env from ${config.gateway_env_path}`);
  const gatewayEnv = readEnvFile(config.gateway_env_path);

  validatePreflight(workerEnv, gatewayEnv);

  console.log("[smoke-ops-preflight] env files ok");
  console.log("[smoke-ops-preflight] worker/gateway auth parity ok");
}

if (require.main === module) {
  main().catch((error) => {
    console.error("[smoke-ops-preflight] failed", error);
    process.exitCode = 1;
  });
}

module.exports = {
  getWorkerGatewaySecret,
  normalizePreflightConfig,
  parseEnvFile,
  readEnvFile,
  validatePreflight,
};
