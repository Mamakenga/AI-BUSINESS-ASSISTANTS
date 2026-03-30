"use strict";

function normalizeRequiredString(value, fieldName) {
  const normalized = String(value || "").trim();
  if (!normalized) {
    throw new Error(`${fieldName} is required`);
  }
  return normalized;
}

function normalizeJobTriggerSmokeConfig(env = process.env) {
  return {
    control_api_url: normalizeRequiredString(env.CONTROL_API_URL || "http://127.0.0.1:3300", "CONTROL_API_URL").replace(/\/$/, ""),
    internal_token: normalizeRequiredString(env.CONTROL_API_INTERNAL_TOKEN, "CONTROL_API_INTERNAL_TOKEN"),
    job_type: normalizeRequiredString(env.SMOKE_JOB_TYPE || "daily_founder_brief", "SMOKE_JOB_TYPE"),
    expected_agent: normalizeRequiredString(env.SMOKE_EXPECT_AGENT || "assistant", "SMOKE_EXPECT_AGENT"),
    next_run_at: String(env.SMOKE_NEXT_RUN_AT || "").trim() || null,
    thread_id: String(env.SMOKE_THREAD_ID || "").trim() || null,
    timeout_ms: Number.parseInt(env.SMOKE_TIMEOUT_MS || "15000", 10),
  };
}

async function triggerJob(config, { fetchImpl = globalThis.fetch } = {}) {
  const response = await fetchImpl(`${config.control_api_url}/jobs/${encodeURIComponent(config.job_type)}/trigger`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${config.internal_token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      ...(config.next_run_at ? { next_run_at: config.next_run_at } : {}),
      ...(config.thread_id ? { thread_id: config.thread_id } : {}),
    }),
    signal: AbortSignal.timeout(config.timeout_ms),
  });

  const text = await response.text();
  let payload = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch (error) {
      throw new Error(`job trigger returned non-JSON body (${response.status}): ${text.slice(0, 200)}`);
    }
  }

  if (!response.ok) {
    throw new Error(`job trigger failed (${response.status}): ${text.slice(0, 300)}`);
  }

  return payload;
}

async function runJobTriggerSmoke(options = {}) {
  const config = normalizeJobTriggerSmokeConfig(options.env || process.env);
  const payload = await triggerJob(config, options);

  if (!payload || typeof payload !== "object") {
    throw new Error("job trigger returned empty payload");
  }

  if (!payload.run || payload.run.agent !== config.expected_agent) {
    throw new Error(`job trigger returned unexpected run agent: expected ${config.expected_agent}`);
  }

  if (payload.run.status !== "pending") {
    throw new Error(`job trigger returned unexpected run status: ${payload.run.status}`);
  }

  if (!payload.job || payload.job.job_type !== config.job_type) {
    throw new Error(`job trigger returned unexpected job_type: expected ${config.job_type}`);
  }

  console.log(`[smoke-job-trigger] job trigger ok for ${config.job_type}`);
  console.log(`[smoke-job-trigger] created run ${payload.run.id} for ${payload.run.agent}`);
  return payload;
}

async function main() {
  await runJobTriggerSmoke();
}

if (require.main === module) {
  main().catch((error) => {
    console.error("[smoke-job-trigger] failed", error);
    process.exit(1);
  });
}

module.exports = {
  normalizeJobTriggerSmokeConfig,
  runJobTriggerSmoke,
  triggerJob,
};
