"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildScenarioExecutionContext,
  normalizeBudgetSmokeConfig,
  runBudgetGuardSmoke,
} = require("../scripts/smoke-runtime-budget-guard");

test("normalizeBudgetSmokeConfig keeps founder direct as the default scenario", () => {
  const config = normalizeBudgetSmokeConfig({});

  assert.equal(config.scenario, "founder_direct");
});

test("buildScenarioExecutionContext prepares a scheduled guard scenario", () => {
  const context = buildScenarioExecutionContext("scheduled");

  assert.equal(context.run.requested_by_agent, "scheduler");
  assert.equal(context.role.id, "assistant");
  assert.ok(context.role.runtime_limits.max_completion_tokens > 0);
});

test("runBudgetGuardSmoke keeps a safe founder reply for direct answers", () => {
  const result = runBudgetGuardSmoke({
    env: {
      SMOKE_BUDGET_SCENARIO: "founder_direct",
    },
  });

  assert.equal(result.completion_status, "failed");
  assert.ok(result.fallback_chain.includes("runtime_budget_guard"));
  assert.match(result.reply_text, /runtime-лимита роли/i);
});

test("runBudgetGuardSmoke keeps a safe founder reply for task threads", () => {
  const result = runBudgetGuardSmoke({
    env: {
      SMOKE_BUDGET_SCENARIO: "founder_task",
    },
  });

  assert.equal(result.completion_status, "failed");
  assert.ok(result.fallback_chain.includes("runtime_budget_guard"));
  assert.match(result.reply_text, /runtime-лимита роли/i);
});

test("runBudgetGuardSmoke suppresses scheduled delivery", () => {
  const result = runBudgetGuardSmoke({
    env: {
      SMOKE_BUDGET_SCENARIO: "scheduled",
    },
  });

  assert.equal(result.completion_status, "failed");
  assert.ok(result.fallback_chain.includes("runtime_budget_guard"));
  assert.equal(result.reply_text, null);
});
