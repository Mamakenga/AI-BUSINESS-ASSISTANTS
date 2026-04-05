"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createSemanticCompileGroup,
  extractAssistantText,
  hasLiteLLMConfig,
  isKnowledgePageVersionNoop,
  normalizeKnowledgeCompilerConfig,
  normalizeKnowledgePageVersionSnapshot,
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
      choices: [{ message: { content: "Simple answer." } }],
    }),
    "Simple answer."
  );

  assert.equal(
    extractAssistantText({
      choices: [{ message: { content: [{ text: "Part 1. " }, { text: "Part 2." }] } }],
    }),
    "Part 1. Part 2."
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
                    "```json\n{\"summary_short\":\"Short.\",\"summary_full\":\"Full.\",\"key_facts\":[\"Fact\"],\"contradictions\":[],\"open_questions\":[]}\n```",
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
    summary_short: "Short.",
    summary_full: "Full.",
    key_facts: ["Fact"],
    contradictions: [],
    open_questions: [],
  });
});

test("normalizeKnowledgePageVersionSnapshot keeps only comparable semantic fields", () => {
  const snapshot = normalizeKnowledgePageVersionSnapshot({
    summary_short: "  Short.  ",
    summary_full: " Full. ",
    key_facts_json: [" Fact 1 ", "", null, "Fact 2"],
    contradictions_json: [" Conflict "],
    open_questions_json: [" Question? "],
    related_pages_json: [null, " task:123 "],
    compiled_markdown: "  # Page  ",
    compiled_by: "knowledge_compiler_semantic_v1",
  });

  assert.deepEqual(snapshot, {
    summary_short: "Short.",
    summary_full: "Full.",
    key_facts_json: ["Fact 1", "Fact 2"],
    contradictions_json: ["Conflict"],
    open_questions_json: ["Question?"],
    related_pages_json: ["task:123"],
    compiled_markdown: "# Page",
  });
});

test("isKnowledgePageVersionNoop ignores metadata-only changes", () => {
  const currentVersion = {
    summary_short: "Short.",
    summary_full: "Full.",
    key_facts_json: ["Fact 1", "Fact 2"],
    contradictions_json: [],
    open_questions_json: [],
    related_pages_json: [],
    compiled_markdown: "# Page\n\n## Summary\nFull.",
    compiled_by: "knowledge_compiler",
    change_reason: "compiled_from_supported_claims",
  };

  const sameContentNextVersion = {
    summary_short: "Short.",
    summary_full: "Full.",
    key_facts_json: ["Fact 1", "Fact 2"],
    contradictions_json: [],
    open_questions_json: [],
    related_pages_json: [],
    compiled_markdown: "# Page\n\n## Summary\nFull.",
    compiled_by: "knowledge_compiler_semantic_v1",
    change_reason: "compiled_from_supported_claims_semantic",
  };

  const changedNextVersion = {
    ...sameContentNextVersion,
    summary_full: "Full. And slightly different.",
  };

  assert.equal(isKnowledgePageVersionNoop(currentVersion, sameContentNextVersion), true);
  assert.equal(isKnowledgePageVersionNoop(currentVersion, changedNextVersion), false);
  assert.equal(isKnowledgePageVersionNoop(null, sameContentNextVersion), false);
});
