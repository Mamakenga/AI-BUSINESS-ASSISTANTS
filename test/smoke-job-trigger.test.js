"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { normalizeJobTriggerSmokeConfig, runJobTriggerSmoke, triggerJob } = require("../scripts/smoke-job-trigger");

test("normalizeJobTriggerSmokeConfig requires internal token and defaults to daily founder brief", () => {
  const config = normalizeJobTriggerSmokeConfig({
    CONTROL_API_URL: "http://127.0.0.1:3300",
    CONTROL_API_INTERNAL_TOKEN: "secret",
  });

  assert.equal(config.control_api_url, "http://127.0.0.1:3300");
  assert.equal(config.job_type, "daily_founder_brief");
  assert.equal(config.expected_agent, "assistant");
});

test("triggerJob rejects non-json bodies", async () => {
  await assert.rejects(
    () =>
      triggerJob(
        {
          control_api_url: "http://127.0.0.1:3300",
          internal_token: "secret",
          job_type: "daily_founder_brief",
          expected_agent: "assistant",
          next_run_at: null,
          thread_id: null,
          timeout_ms: 1000,
        },
        {
          fetchImpl: async () => ({
            ok: true,
            status: 200,
            text: async () => "not json",
          }),
        }
      ),
    /non-JSON body/
  );
});

test("runJobTriggerSmoke validates returned run and job fields", async () => {
  const payload = await runJobTriggerSmoke({
    env: {
      CONTROL_API_URL: "http://127.0.0.1:3300",
      CONTROL_API_INTERNAL_TOKEN: "secret",
      SMOKE_JOB_TYPE: "daily_founder_brief",
      SMOKE_EXPECT_AGENT: "assistant",
    },
    fetchImpl: async () => ({
      ok: true,
      status: 201,
      text: async () =>
        JSON.stringify({
          job: {
            job_type: "daily_founder_brief",
          },
          run: {
            id: 41,
            agent: "assistant",
            status: "pending",
          },
        }),
    }),
  });

  assert.equal(payload.run.id, 41);
});
