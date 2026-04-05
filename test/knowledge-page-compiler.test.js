"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createSemanticCompileGroup,
  extractAssistantText,
  hasLiteLLMConfig,
  normalizeKnowledgeCompilerConfig,
} = require("../src/knowledge-page-compiler");

test("hasLiteLLMConfig detects when semantic compilation can run", () => {
  assert.equal(hasLiteLLMConfig({}), false);
  assert.equal(hasLiteLLMConfig({ LITELLM_BASE_URL: "http://127.0.0.1:4000" }), true);
});

test("normalizeKnowledgeCompilerConfig reuses LiteLLM config and compiler model", () => {
  const config = normalizeKnowledgeCompilerConfig({
    LITELLM_BASE_URL: "http://127.0.0.1:4000",
    LITELLM_API_KEY: "secret",
    KNOWLEDGE_COMPILER_MODEL: "assistant-model",
    KNOWLEDGE_COMPILER_TIMEOUT_MS: "5000",
  });

  assert.equal(config.base_url, "http://127.0.0.1:4000");
  assert.equal(config.api_key, "secret");
  assert.equal(config.model, "assistant-model");
  assert.equal(config.timeout_ms, 5000);
});

test("extractAssistantText handles string and array response content", () => {
  assert.equal(
    extractAssistantText({
      choices: [{ message: { content: "Простой ответ." } }],
    }),
    "Простой ответ."
  );

  assert.equal(
    extractAssistantText({
      choices: [{ message: { content: [{ text: "Часть 1. " }, { text: "Часть 2." }] } }],
    }),
    "Часть 1. Часть 2."
  );
});

test("createSemanticCompileGroup extracts JSON from LiteLLM response", async () => {
  const compileGroup = createSemanticCompileGroup(
    {
      base_url: "http://127.0.0.1:4000",
      api_key: "secret",
      timeout_ms: 5000,
      model: "assistant-model",
    },
    async (_url, options) => {
      const body = JSON.parse(options.body);
      assert.equal(body.model, "assistant-model");
      assert.equal(body.temperature, 0);
      return {
        ok: true,
        text: async () =>
          JSON.stringify({
            choices: [
              {
                message: {
                  content:
                    "```json\n{\"summary_short\":\"Коротко.\",\"summary_full\":\"Полно.\",\"key_facts\":[\"Факт\"],\"contradictions\":[],\"open_questions\":[]}\n```",
                },
              },
            ],
          }),
      };
    }
  );

  const result = await compileGroup({
    system_prompt: "system",
    user_prompt: "user",
  });

  assert.deepEqual(result, {
    summary_short: "Коротко.",
    summary_full: "Полно.",
    key_facts: ["Факт"],
    contradictions: [],
    open_questions: [],
  });
});
