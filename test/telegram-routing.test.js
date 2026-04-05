"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { resolveTelegramRouting } = require("../src/telegram-routing");

test("explicit role tag wins over topic role", () => {
  const result = resolveTelegramRouting({
    text: "@finance \u0441\u0440\u0430\u0432\u043d\u0438 \u043c\u0430\u0440\u0442 \u0438 \u0444\u0435\u0432\u0440\u0430\u043b\u044c",
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
    text: "\u0421\u043e\u0431\u0435\u0440\u0438 \u043c\u043d\u0435 \u043a\u0430\u0440\u0442\u0438\u043d\u0443 \u043f\u043e \u0444\u0438\u043b\u0438\u0430\u043b\u0430\u043c",
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
    text: "@orchestrator \u0441\u043a\u043e\u043b\u044c\u043a\u043e \u0443 \u043d\u0430\u0441 \u0443\u0447\u0435\u043d\u0438\u043a\u043e\u0432?",
    topic_name: "General",
  });

  assert.equal(result.resolved_role, "orchestrator");
  assert.equal(result.route_source, "tag");
  assert.equal(result.interaction_type, "direct_answer");
  assert.equal(result.should_create_task, false);
});

test("role topic without tag uses topic role", () => {
  const result = resolveTelegramRouting({
    text: "\u041f\u0440\u043e\u0432\u0435\u0440\u044c \u043a\u043e\u043d\u043a\u0443\u0440\u0435\u043d\u0442\u043e\u0432 \u0432 \u0412\u0430\u0440\u043d\u0435",
    topic_name: "02 Researcher",
  });

  assert.equal(result.explicit_role, null);
  assert.equal(result.topic_role, "researcher");
  assert.equal(result.resolved_role, "researcher");
  assert.equal(result.route_source, "topic");
});

test("question in a role topic becomes direct answer", () => {
  const result = resolveTelegramRouting({
    text: "\u041a\u0430\u043a\u0430\u044f \u0443 \u043d\u0430\u0441 \u0434\u0438\u043d\u0430\u043c\u0438\u043a\u0430 \u043f\u043e \u043c\u0430\u0440\u0442\u0443?",
    topic_name: "04 Finance",
  });

  assert.equal(result.resolved_role, "finance_analyst");
  assert.equal(result.interaction_type, "direct_answer");
  assert.equal(result.should_create_task, false);
});

test("assistant topic without tag stays a direct answer path", () => {
  const result = resolveTelegramRouting({
    text: "what is urgent today?",
    topic_name: "01 Assistant",
  });

  assert.equal(result.explicit_role, null);
  assert.equal(result.topic_role, "assistant");
  assert.equal(result.resolved_role, "assistant");
  assert.equal(result.route_source, "topic");
  assert.equal(result.interaction_type, "direct_answer");
  assert.equal(result.should_create_task, false);
});

test("role tag with a concrete request still becomes a task", () => {
  const result = resolveTelegramRouting({
    text: "@assistant prepare the weekly digest",
    topic_name: "01 Assistant",
  });

  assert.equal(result.resolved_role, "assistant");
  assert.equal(result.interaction_type, "one_role_task");
  assert.equal(result.should_create_task, true);
});

test("role topic without tag still creates a task for concrete requests", () => {
  const result = resolveTelegramRouting({
    text: "prepare the weekly digest",
    topic_name: "01 Assistant",
  });

  assert.equal(result.explicit_role, null);
  assert.equal(result.topic_role, "assistant");
  assert.equal(result.resolved_role, "assistant");
  assert.equal(result.route_source, "topic");
  assert.equal(result.interaction_type, "one_role_task");
  assert.equal(result.should_create_task, true);
});

test("ambiguous contextless message asks for clarification", () => {
  const result = resolveTelegramRouting({
    text: "\u041f\u043e\u0441\u043c\u043e\u0442\u0440\u0438 \u043f\u043e\u0436\u0430\u043b\u0443\u0439\u0441\u0442\u0430",
    topic_name: "",
    is_group_context: false,
  });

  assert.equal(result.resolved_role, null);
  assert.equal(result.needs_clarification, true);
  assert.equal(result.interaction_type, null);
  assert.equal(result.should_create_task, false);
  assert.match(result.clarification_message, /тему Telegram|тег роли/i);
});
