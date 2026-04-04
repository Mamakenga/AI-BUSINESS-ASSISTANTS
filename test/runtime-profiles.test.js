"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  ALLOWED_TASK_ROLES,
  ROLE_ALIASES,
  ROLE_IDS,
  ROLE_LABELS_DATIVE,
  ROLE_PROFILES,
  TOPIC_ROLE_BY_NAME,
} = require("../src/runtime-profiles");

test("runtime profiles registry exposes all expected roles", () => {
  assert.deepEqual(ROLE_IDS, [
    "orchestrator",
    "assistant",
    "researcher",
    "methodist",
    "finance_analyst",
    "critic",
    "memory_curator",
  ]);
});

test("founder-facing aliases and topics are derived from runtime profiles", () => {
  assert.equal(ROLE_ALIASES.get("assistant"), "assistant");
  assert.equal(ROLE_ALIASES.get("finance"), "finance_analyst");
  assert.equal(TOPIC_ROLE_BY_NAME.get("00 orchestrator"), "orchestrator");
  assert.equal(TOPIC_ROLE_BY_NAME.get("04 finance"), "finance_analyst");
  assert.equal(TOPIC_ROLE_BY_NAME.get("general"), "orchestrator");
});

test("memory curator remains service-only and is still a valid task role", () => {
  assert.equal(ROLE_PROFILES.memory_curator.telegram_topic, null);
  assert.equal(ROLE_PROFILES.memory_curator.founder_entry_mode, "service_only");
  assert.equal(ALLOWED_TASK_ROLES.has("memory_curator"), true);
});

test("each runtime profile declares a model route and an output contract", () => {
  for (const roleId of ROLE_IDS) {
    const profile = ROLE_PROFILES[roleId];
    assert.equal(profile.preferred_models.length, 3);
    assert.equal(typeof profile.model_alias, "string");
    assert.ok(profile.model_alias.length > 0);
    assert.equal(typeof profile.runtime_limits, "object");
    assert.ok(profile.runtime_limits.max_completion_tokens > 0);
    assert.ok(profile.runtime_limits.max_total_tokens > 0);
    assert.ok(profile.runtime_limits.max_response_cost_usd > 0);
    assert.equal(typeof profile.output_contract, "string");
    assert.ok(profile.output_contract.length > 0);
    assert.ok(profile.memory_scopes.length > 0);
  }
});

test("reply labels are available for all founder-visible roles", () => {
  assert.equal(ROLE_LABELS_DATIVE.get("orchestrator"), "оркестратору");
  assert.equal(ROLE_LABELS_DATIVE.get("researcher"), "ресерчеру");
  assert.equal(ROLE_LABELS_DATIVE.get("critic"), "критику");
});
