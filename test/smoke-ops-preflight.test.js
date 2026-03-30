"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  getWorkerGatewaySecret,
  normalizePreflightConfig,
  parseEnvFile,
  validatePreflight,
} = require("../scripts/smoke-ops-preflight");

test("parseEnvFile ignores comments and preserves key values", () => {
  const env = parseEnvFile(`
# comment
DATABASE_URL=postgres://db
LITELLM_API_KEY=secret
QUOTED="value"
`);

  assert.equal(env.DATABASE_URL, "postgres://db");
  assert.equal(env.LITELLM_API_KEY, "secret");
  assert.equal(env.QUOTED, "value");
});

test("normalizePreflightConfig provides VPS defaults", () => {
  const config = normalizePreflightConfig({});

  assert.equal(config.worker_env_path, "/etc/ops.env");
  assert.equal(config.gateway_env_path, "/home/ops/.env.ops-litellm");
});

test("getWorkerGatewaySecret prefers API key and falls back to master key", () => {
  assert.equal(getWorkerGatewaySecret({ LITELLM_API_KEY: "api", LITELLM_MASTER_KEY: "master" }), "api");
  assert.equal(getWorkerGatewaySecret({ LITELLM_MASTER_KEY: "master" }), "master");
});

test("validatePreflight accepts matching worker and gateway env", () => {
  assert.doesNotThrow(() =>
    validatePreflight(
      {
        DATABASE_URL: "postgres://db",
        PORT: "3000",
        CONTROL_API_URL: "http://127.0.0.1:3000",
        TELEGRAM_BOT_TOKEN: "token",
        TELEGRAM_ALLOWED_CHAT_ID: "-1001",
        LITELLM_BASE_URL: "http://127.0.0.1:4000",
        LITELLM_API_KEY: "shared-secret",
      },
      {
        LITELLM_MASTER_KEY: "shared-secret",
        OPENAI_API_KEY: "openai",
        ANTHROPIC_API_KEY: "anthropic",
        GEMINI_API_KEY: "gemini",
      }
    )
  );
});

test("validatePreflight rejects auth mismatch", () => {
  assert.throws(
    () =>
      validatePreflight(
        {
          DATABASE_URL: "postgres://db",
          PORT: "3000",
          CONTROL_API_URL: "http://127.0.0.1:3000",
          TELEGRAM_BOT_TOKEN: "token",
          TELEGRAM_ALLOWED_CHAT_ID: "-1001",
          LITELLM_BASE_URL: "http://127.0.0.1:4000",
          LITELLM_API_KEY: "worker-secret",
        },
        {
          LITELLM_MASTER_KEY: "gateway-secret",
          OPENAI_API_KEY: "openai",
          ANTHROPIC_API_KEY: "anthropic",
          GEMINI_API_KEY: "gemini",
        }
      ),
    /does not match gateway master key/
  );
});
