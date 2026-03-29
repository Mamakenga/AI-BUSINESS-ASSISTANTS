"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { resolveTelegramRouting } = require("../src/telegram-routing");

test("explicit role tag wins over topic role", () => {
  const result = resolveTelegramRouting({
    text: "@finance сравни март и февраль",
    topic_name: "02 Researcher",
  });

  assert.equal(result.explicit_role, "finance_analyst");
  assert.equal(result.topic_role, "researcher");
  assert.equal(result.resolved_role, "finance_analyst");
  assert.equal(result.route_source, "tag");
  assert.equal(result.interaction_type, "one_role_task");
  assert.equal(result.should_create_task, true);
});

test("general topic defaults to orchestrator", () => {
  const result = resolveTelegramRouting({
    text: "Собери мне картину по филиалам",
    topic_name: "General",
  });

  assert.equal(result.topic_role, "orchestrator");
  assert.equal(result.resolved_role, "orchestrator");
  assert.equal(result.route_source, "topic");
  assert.equal(result.interaction_type, "multi_role_task");
  assert.equal(result.should_create_task, true);
});

test("role topic without tag uses topic role", () => {
  const result = resolveTelegramRouting({
    text: "Проверь конкурентов в Варне",
    topic_name: "02 Researcher",
  });

  assert.equal(result.explicit_role, null);
  assert.equal(result.topic_role, "researcher");
  assert.equal(result.resolved_role, "researcher");
  assert.equal(result.route_source, "topic");
});

test("question in a role topic becomes direct answer", () => {
  const result = resolveTelegramRouting({
    text: "Какая у нас динамика по марту?",
    topic_name: "04 Finance",
  });

  assert.equal(result.resolved_role, "finance_analyst");
  assert.equal(result.interaction_type, "direct_answer");
  assert.equal(result.should_create_task, false);
});

test("ambiguous contextless message asks for clarification", () => {
  const result = resolveTelegramRouting({
    text: "Посмотри пожалуйста",
    topic_name: "",
    is_group_context: false,
  });

  assert.equal(result.resolved_role, null);
  assert.equal(result.needs_clarification, true);
  assert.equal(result.interaction_type, null);
  assert.equal(result.should_create_task, false);
});
