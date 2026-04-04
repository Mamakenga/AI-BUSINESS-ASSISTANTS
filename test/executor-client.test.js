"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildExecutorRequest,
  executeRoleRun,
  normalizeExecutorResponse,
  normalizeLiteLLMConfig,
  resolveModelAlias,
} = require("../src/executor-client");

function createExecutionContext() {
  return {
    role: {
      id: "assistant",
      execution_mode: "single_role_worker",
      model_alias: "assistant-model",
      runtime_limits: {
        max_completion_tokens: 900,
        max_total_tokens: 2500,
        max_response_cost_usd: 0.02,
      },
      output_contract: "assistant_summary_v1",
    },
    run: {
      id: 11,
      task_id: null,
      thread_id: "thread_11",
    },
    task: null,
    founder_request: "@assistant what is urgent today?",
    handoff_messages: [],
    memory_bundle: {
      owner: [{ fact: "Founder prefers concise answers." }],
    },
  };
}

test("normalizeLiteLLMConfig requires base url", () => {
  assert.throws(() => normalizeLiteLLMConfig({}), /LITELLM_BASE_URL is required/);
});

test("resolveModelAlias requires role model alias", () => {
  assert.equal(resolveModelAlias(createExecutionContext()), "assistant-model");
});

test("buildExecutorRequest creates OpenAI-compatible chat request", () => {
  const request = buildExecutorRequest(createExecutionContext());

  assert.equal(request.model, "assistant-model");
  assert.equal(request.stream, false);
  assert.equal(request.max_tokens, 900);
  assert.equal(request.messages[0].role, "system");
  assert.equal(request.messages[1].role, "user");
  assert.equal(request.metadata.role_id, "assistant");
  assert.equal(request.metadata.request_type, "direct-answer");
});

test("normalizeExecutorResponse extracts assistant text", () => {
  const result = normalizeExecutorResponse(
    {
      model: "assistant-model",
      choices: [
        {
          message: {
            content: "Short founder-facing answer.",
          },
        },
      ],
      usage: {
        prompt_tokens: 23,
        completion_tokens: 100,
        total_tokens: 123,
      },
      _hidden_params: {
        response_cost: 0.0042,
      },
    },
    createExecutionContext(),
    { model: "assistant-model" }
  );

  assert.equal(result.status, "completed");
  assert.equal(result.model_used, "assistant-model");
  assert.equal(result.reply_text, "Short founder-facing answer.");
  assert.deepEqual(result.usage_json, {
    prompt_tokens: 23,
    completion_tokens: 100,
    total_tokens: 123,
  });
  assert.equal(result.prompt_tokens, 23);
  assert.equal(result.completion_tokens, 100);
  assert.equal(result.total_tokens, 123);
  assert.equal(result.response_cost_usd, 0.0042);
});

test("normalizeExecutorResponse extracts cost from usage payload when top-level fields are absent", () => {
  const result = normalizeExecutorResponse(
    {
      model: "assistant-model",
      choices: [
        {
          message: {
            content: "Telemetry-backed answer.",
          },
        },
      ],
      usage: {
        prompt_tokens: 360,
        completion_tokens: 163,
        total_tokens: 523,
        cost: 0.0001518,
        cost_details: {
          upstream_inference_cost: 0.0001518,
          upstream_inference_prompt_cost: 0.000054,
          upstream_inference_completions_cost: 0.0000978,
        },
      },
    },
    createExecutionContext(),
    { model: "assistant-model" }
  );

  assert.equal(result.response_cost_usd, 0.0001518);
});

test("executeRoleRun wraps timeout as retryable executor error", async () => {
  await assert.rejects(
    () =>
      executeRoleRun(createExecutionContext(), {
        config: {
          base_url: "http://127.0.0.1:4000",
          api_key: null,
          timeout_ms: 25,
        },
        fetchImpl: async () => {
          const error = new Error("aborted");
          error.name = "AbortError";
          throw error;
        },
      }),
    (error) => {
      assert.equal(error.name, "ExecutorClientError");
      assert.equal(error.executor.reason, "timeout");
      assert.equal(error.executor.retryable, true);
      assert.equal(error.executor.model_alias, "assistant-model");
      return true;
    }
  );
});

test("executeRoleRun wraps rate limit responses as retryable executor error", async () => {
  await assert.rejects(
    () =>
      executeRoleRun(createExecutionContext(), {
        config: {
          base_url: "http://127.0.0.1:4000",
          api_key: null,
          timeout_ms: 1000,
        },
        fetchImpl: async () => ({
          ok: false,
          status: 429,
          text: async () => JSON.stringify({ error: "too many requests" }),
        }),
      }),
    (error) => {
      assert.equal(error.name, "ExecutorClientError");
      assert.equal(error.executor.reason, "rate_limit");
      assert.equal(error.executor.retryable, true);
      assert.equal(error.executor.upstream_status, 429);
      return true;
    }
  );
});


test("executeRoleRun preserves non-json rate limit classification", async () => {
  await assert.rejects(
    () =>
      executeRoleRun(createExecutionContext(), {
        config: {
          base_url: "http://127.0.0.1:4000",
          api_key: null,
          timeout_ms: 1000,
        },
        fetchImpl: async () => ({
          ok: false,
          status: 429,
          text: async () => "Too Many Requests",
        }),
      }),
    (error) => {
      assert.equal(error.name, "ExecutorClientError");
      assert.equal(error.executor.reason, "rate_limit");
      assert.equal(error.executor.retryable, true);
      assert.equal(error.executor.upstream_status, 429);
      assert.match(error.executor.raw_fragment, /Too Many Requests/);
      return true;
    }
  );
});
