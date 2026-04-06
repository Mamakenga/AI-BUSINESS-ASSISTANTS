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

test("orchestrator question may stay a direct answer", () => {
  const result = resolveTelegramRouting({
    text: "@orchestrator сколько у нас учеников?",
    topic_name: "General",
  });

  assert.equal(result.resolved_role, "orchestrator");
  assert.equal(result.route_source, "tag");
  assert.equal(result.interaction_type, "direct_answer");
  assert.equal(result.should_create_task, false);
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

test("orchestrator topic without tag stays a direct answer path", () => {
  const result = resolveTelegramRouting({
    text: "what is urgent today?",
    topic_name: "01 Orchestrator",
  });

  assert.equal(result.explicit_role, null);
  assert.equal(result.topic_role, "orchestrator");
  assert.equal(result.resolved_role, "orchestrator");
  assert.equal(result.route_source, "topic");
  assert.equal(result.interaction_type, "direct_answer");
  assert.equal(result.should_create_task, false);
});

test("orchestrator topic keeps complex founder questions in orchestrator", () => {
  const result = resolveTelegramRouting({
    text:
      "Сейчас решается вопрос, откатить ли назад отказ от франшизы или делать ребрендинг. Денег на ребрендинг нет, кредит брать не хочется. Какие есть варианты действий?",
    topic_name: "01 Orchestrator",
  });

  assert.equal(result.topic_role, "orchestrator");
  assert.equal(result.resolved_role, "orchestrator");
  assert.equal(result.route_source, "topic");
  assert.equal(result.interaction_type, "direct_answer");
  assert.equal(result.should_create_task, false);
});

test("role tag with a concrete orchestrator request still becomes a task", () => {
  const result = resolveTelegramRouting({
    text: "@orchestrator prepare the weekly digest",
    topic_name: "01 Orchestrator",
  });

  assert.equal(result.resolved_role, "orchestrator");
  assert.equal(result.interaction_type, "multi_role_task");
  assert.equal(result.should_create_task, true);
});

test("orchestrator topic without tag still creates a task for concrete requests", () => {
  const result = resolveTelegramRouting({
    text: "prepare the weekly digest",
    topic_name: "01 Orchestrator",
  });

  assert.equal(result.explicit_role, null);
  assert.equal(result.topic_role, "orchestrator");
  assert.equal(result.resolved_role, "orchestrator");
  assert.equal(result.route_source, "topic");
  assert.equal(result.interaction_type, "multi_role_task");
  assert.equal(result.should_create_task, true);
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
  assert.match(result.clarification_message, /тему Telegram|тег роли/i);
});
