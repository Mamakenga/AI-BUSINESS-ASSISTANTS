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

test("findFounderReplyQualityIssues detects broad methodist intake questionnaires", () => {
  const issues = findFounderReplyQualityIssues(
    "\u0427\u0442\u043e\u0431\u044b \u0442\u043e\u0447\u043d\u043e \u0441\u0442\u0440\u0443\u043a\u0442\u0443\u0440\u0438\u0440\u043e\u0432\u0430\u0442\u044c \u043a\u0443\u0440\u0441, \u043c\u043d\u0435 \u043d\u0443\u0436\u043d\u043e \u043f\u043e\u043d\u044f\u0442\u044c: \u043a\u0442\u043e \u0446\u0435\u043b\u0435\u0432\u0430\u044f \u0430\u0443\u0434\u0438\u0442\u043e\u0440\u0438\u044f? \u043a\u0430\u043a\u043e\u0439 \u0432\u043e\u0437\u0440\u0430\u0441\u0442 \u0440\u043e\u0434\u0438\u0442\u0435\u043b\u0435\u0439? \u043a\u0430\u043a\u043e\u0439 \u0443\u0440\u043e\u0432\u0435\u043d\u044c \u043f\u043e\u0434\u0433\u043e\u0442\u043e\u0432\u043a\u0438? \u043a\u0430\u043a\u043e\u0439 \u0444\u043e\u0440\u043c\u0430\u0442 \u0438 \u0434\u043b\u0438\u0442\u0435\u043b\u044c\u043d\u043e\u0441\u0442\u044c? \u0441\u043a\u043e\u043b\u044c\u043a\u043e \u0437\u0430\u043d\u044f\u0442\u0438\u0439 \u043d\u0443\u0436\u043d\u043e?",
    { roleId: "methodist" }
  );

  assert.ok(issues.includes("methodist_broad_intake"));
});

test("findFounderReplyQualityIssues does not block methodist draft structures with one clarification", () => {
  const issues = findFounderReplyQualityIssues(
    [
      "��������� ����� ������ ����-�����:",
      "1. �������� � AI ��� ���������.",
      "2. �������� �������� ���� � � �����.",
      "3. �����, ����������� � ���������� ����������.",
      "4. �������� �� ���� �������� ������.",
      "���� �����, ������ � ����� ��� � 3 ������� ��� ������-������.",
    ].join(" "),
    { roleId: "methodist" }
  );

  assert.deepEqual(issues, []);
});
