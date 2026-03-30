"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { normalizeOpsSmokeConfig, requestJson, runOpsStackSmoke } = require("../scripts/smoke-ops-stack");

test("normalizeOpsSmokeConfig uses CONTROL_API_URL and LiteLLM env defaults", () => {
  const config = normalizeOpsSmokeConfig({
    CONTROL_API_URL: "http://127.0.0.1:3000",
    LITELLM_BASE_URL: "http://127.0.0.1:4000",
  });

  assert.equal(config.control_api_url, "http://127.0.0.1:3000");
  assert.equal(config.litellm.base_url, "http://127.0.0.1:4000");
  assert.equal(config.litellm.model, "assistant-model");
});

test("requestJson rejects non-json health payloads", async () => {
  await assert.rejects(
    () =>
      requestJson("http://127.0.0.1:3000/health", {
        timeout_ms: 1000,
        fetchImpl: async () => ({
          ok: true,
          status: 200,
          text: async () => "not json",
        }),
      }),
    /returned non-JSON body/
  );
});

test("runOpsStackSmoke checks control API before LiteLLM", async () => {
  const calls = [];

  await runOpsStackSmoke({
    env: {
      CONTROL_API_URL: "http://127.0.0.1:3000",
      LITELLM_BASE_URL: "http://127.0.0.1:4000",
      LITELLM_MASTER_KEY: "secret",
    },
    fetchImpl: async (url) => {
      calls.push(url);

      if (url === "http://127.0.0.1:3000/health") {
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({ ok: true, service: "control-api" }),
        };
      }

      if (url === "http://127.0.0.1:4000/v1/models") {
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({ data: [{ id: "assistant-model" }] }),
        };
      }

      throw new Error(`unexpected url ${url}`);
    },
  });

  assert.deepEqual(calls, ["http://127.0.0.1:3000/health", "http://127.0.0.1:4000/v1/models"]);
});

test("runbook keeps shell smoke env separate from worker systemd env", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const runbook = fs.readFileSync(path.join(__dirname, "..", "DEPLOY_RUNBOOK.md"), "utf8");

  assert.match(runbook, /shell exports are for the smoke command only/);
  assert.match(runbook, /`ops-worker\.service` still reads LiteLLM auth from `\/etc\/ops\.env`/);
  assert.match(runbook, /does not prove worker auth unless `\/etc\/ops\.env` already contains the matching LiteLLM secret/);
});
