"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  extractAssistantText,
  litellmRequest,
  normalizeSmokeConfig,
} = require("../scripts/smoke-litellm");

test("normalizeSmokeConfig sets expected smoke text by default", () => {
  const config = normalizeSmokeConfig({
    LITELLM_BASE_URL: "http://127.0.0.1:4000",
  });

  assert.equal(config.model, "assistant-model");
  assert.equal(config.prompt, "Reply with exactly: OK");
  assert.equal(config.expected_text, "OK");
});

test("extractAssistantText supports string and structured content", () => {
  assert.equal(
    extractAssistantText({
      choices: [{ message: { content: "OK" } }],
    }),
    "OK"
  );

  assert.equal(
    extractAssistantText({
      choices: [{ message: { content: [{ text: "O" }, { text: "K" }] } }],
    }),
    "OK"
  );
});

test("litellmRequest preserves upstream status for non-json failures", async () => {
  await assert.rejects(
    () =>
      litellmRequest(
        {
          base_url: "http://127.0.0.1:4000",
          api_key: "secret",
          timeout_ms: 1000,
        },
        "/v1/models",
        null,
        {
          fetchImpl: async () => ({
            ok: false,
            status: 503,
            text: async () => "upstream unavailable",
          }),
        }
      ),
    /\/v1\/models failed with 503: upstream unavailable/
  );
});
