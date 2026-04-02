"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildSimulationScenarios,
  normalizeSimulationConfig,
  resolveScenario,
  runAssistantSimulation,
} = require("../scripts/simulate-assistant-context");

test("normalizeSimulationConfig keeps useful defaults", () => {
  const config = normalizeSimulationConfig({});

  assert.equal(config.scenario, "empty_context");
  assert.equal(config.founder_request, "@assistant что у нас сейчас самое срочное?");
  assert.equal(config.dry_run, false);
});

test("resolveScenario returns seeded assistant context", () => {
  const resolved = resolveScenario({
    scenario: "seeded_ops_focus",
    founder_request: "@assistant что у нас сейчас самое срочное?",
  });

  assert.equal(resolved.scenario_id, "seeded_ops_focus");
  assert.equal(resolved.execution_context.role.id, "assistant");
  assert.ok(Array.isArray(resolved.execution_context.handoff_messages));
  assert.ok(resolved.execution_context.handoff_messages.length >= 1);
});

test("resolveScenario returns business leader simulation without ops-specific handoff dependence", () => {
  const resolved = resolveScenario({
    scenario: "seeded_business_leader",
    founder_request: "@assistant что у нас сейчас самое срочное?",
  });

  assert.equal(resolved.scenario_id, "seeded_business_leader");
  assert.equal(resolved.execution_context.role.id, "assistant");
  assert.match(JSON.stringify(resolved.execution_context.memory_bundle), /Telegram-first/);
  assert.match(JSON.stringify(resolved.execution_context.memory_bundle), /полезные ответы ролей/i);
});

test("buildSimulationScenarios rewrites founder request into both scenarios", () => {
  const scenarios = buildSimulationScenarios("@assistant что сейчас важно?");

  assert.equal(scenarios.empty_context.founder_request, "@assistant что сейчас важно?");
  assert.equal(scenarios.seeded_ops_focus.founder_request, "@assistant что сейчас важно?");
  assert.equal(scenarios.seeded_business_leader.founder_request, "@assistant что сейчас важно?");
});

test("runAssistantSimulation supports dry-run preview without executor call", async () => {
  const result = await runAssistantSimulation({
    env: {
      SIM_ASSISTANT_SCENARIO: "empty_context",
      SIM_DRY_RUN: "1",
      SIM_SHOW_PROMPT: "1",
    },
  });

  assert.equal(result.scenario_id, "empty_context");
  assert.equal(result.executor_result, null);
  assert.match(result.execution_messages.system_prompt, /Direct-answer rules:/);
  assert.match(result.execution_messages.user_prompt, /@assistant/);
});
