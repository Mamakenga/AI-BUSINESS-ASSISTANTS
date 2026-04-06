"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { buildTelegramIntakePlan, deriveTaskTitle } = require("../src/telegram-intake");

function createDeterministicIdFactory() {
  let index = 0;
  return (prefix) => `${prefix}_${++index}`;
}

test("deriveTaskTitle strips role tag and trailing punctuation", () => {
  assert.equal(
    deriveTaskTitle("@researcher \u0441\u0440\u0430\u0432\u043d\u0438 \u043a\u043e\u043d\u043a\u0443\u0440\u0435\u043d\u0442\u043e\u0432 \u0432 \u0412\u0430\u0440\u043d\u0435?"),
    "\u0441\u0440\u0430\u0432\u043d\u0438 \u043a\u043e\u043d\u043a\u0443\u0440\u0435\u043d\u0442\u043e\u0432 \u0432 \u0412\u0430\u0440\u043d\u0435"
  );
});

test("intake plan creates thread and task for one-role task", () => {
  const plan = buildTelegramIntakePlan(
    {
      text: "@researcher \u0441\u0440\u0430\u0432\u043d\u0438 \u043a\u043e\u043d\u043a\u0443\u0440\u0435\u043d\u0442\u043e\u0432 \u0432 \u0412\u0430\u0440\u043d\u0435",
      topic_name: "02 Researcher",
    },
    { idFactory: createDeterministicIdFactory() }
  );

  assert.equal(plan.should_persist, true);
  assert.equal(plan.thread_id, "thread_1");
  assert.equal(plan.route.resolved_role, "researcher");
  assert.equal(plan.task.id, "task_2");
  assert.equal(plan.task.thread_id, "thread_1");
  assert.equal(plan.founder_message.task_id, "task_2");
  assert.equal(plan.run.task_id, "task_2");
});

test("intake plan skips task creation for direct answer", () => {
  const plan = buildTelegramIntakePlan(
    {
      text: "@finance \u0441\u043a\u043e\u043b\u044c\u043a\u043e \u0443 \u043d\u0430\u0441 \u0443\u0447\u0435\u043d\u0438\u043a\u043e\u0432",
      topic_name: "04 Finance",
    },
    { idFactory: createDeterministicIdFactory() }
  );

  assert.equal(plan.should_persist, true);
  assert.equal(plan.route.interaction_type, "direct_answer");
  assert.equal(plan.task, null);
  assert.equal(plan.founder_message.task_id, null);
  assert.equal(plan.run.task_id, null);
});

test("intake plan resolves same-topic direct answer without role tag", () => {
  const plan = buildTelegramIntakePlan(
    {
      text: "what is urgent today?",
      topic_name: "01 Assistant",
    },
    { idFactory: createDeterministicIdFactory() }
  );

  assert.equal(plan.should_persist, true);
  assert.equal(plan.route.resolved_role, "assistant");
  assert.equal(plan.route.route_source, "topic");
  assert.equal(plan.route.interaction_type, "direct_answer");
  assert.equal(plan.task, null);
  assert.equal(plan.run.task_id, null);
});

test("intake plan routes assistant complex founder question through orchestrator gate", () => {
  const plan = buildTelegramIntakePlan(
    {
      text:
        "Сейчас решается вопрос, откатить ли назад отказ от франшизы или делать ребрендинг. Денег на ребрендинг нет, кредит брать не хочется. Какие есть варианты действий?",
      topic_name: "01 Assistant",
    },
    { idFactory: createDeterministicIdFactory() }
  );

  assert.equal(plan.should_persist, true);
  assert.equal(plan.route.topic_role, "assistant");
  assert.equal(plan.route.resolved_role, "orchestrator");
  assert.equal(plan.route.route_source, "assistant_gate");
  assert.equal(plan.route.interaction_type, "direct_answer");
  assert.equal(plan.task, null);
  assert.equal(plan.run.task_id, null);
});

test("intake plan resolves same-topic task without role tag", () => {
  const plan = buildTelegramIntakePlan(
    {
      text: "prepare the weekly digest",
      topic_name: "01 Assistant",
    },
    { idFactory: createDeterministicIdFactory() }
  );

  assert.equal(plan.should_persist, true);
  assert.equal(plan.route.resolved_role, "assistant");
  assert.equal(plan.route.route_source, "topic");
  assert.equal(plan.route.interaction_type, "one_role_task");
  assert.equal(plan.task.id, "task_2");
  assert.equal(plan.task.title, "prepare the weekly digest");
  assert.equal(plan.founder_message.task_id, "task_2");
  assert.equal(plan.run.task_id, "task_2");
});

test("intake plan asks for clarification when routing is ambiguous", () => {
  const plan = buildTelegramIntakePlan(
    {
      text: "\u041f\u043e\u0441\u043c\u043e\u0442\u0440\u0438 \u043f\u043e\u0436\u0430\u043b\u0443\u0439\u0441\u0442\u0430",
      topic_name: "",
      is_group_context: false,
    },
    { idFactory: createDeterministicIdFactory() }
  );

  assert.equal(plan.should_persist, false);
  assert.equal(plan.thread_id, null);
  assert.equal(plan.task, null);
  assert.equal(plan.run, null);
});
