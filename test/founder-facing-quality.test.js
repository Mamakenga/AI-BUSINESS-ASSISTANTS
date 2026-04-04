"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { findFounderReplyQualityIssues } = require("../src/founder-facing-quality");

test("findFounderReplyQualityIssues returns empty list for normal founder-facing text", () => {
  assert.deepEqual(
    findFounderReplyQualityIssues("Короткий статус: подтвержденных сигналов мало, следующий безопасный шаг — собрать 2 новых факта."),
    []
  );
});

test("findFounderReplyQualityIssues detects internal scope tags and identifiers", () => {
  const issues = findFounderReplyQualityIssues(
    "Подтверждено: [business] есть один факт, thread_id: 7a04104a-18c8-4f1f-8f98-58d63737c820."
  );

  assert.ok(issues.includes("internal_scope_tag"));
  assert.ok(issues.includes("internal_identifier"));
});

test("findFounderReplyQualityIssues detects internal source labels", () => {
  const issues = findFounderReplyQualityIssues(
    "Источник: memory_curator:long_term_fact. Decision: decision:owner_priority."
  );

  assert.ok(issues.includes("internal_source_label"));
});
