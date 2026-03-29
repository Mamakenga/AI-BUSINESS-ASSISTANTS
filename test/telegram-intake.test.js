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
    deriveTaskTitle("@researcher сравни конкурентов в Варне?"),
    "сравни конкурентов в Варне"
  );
});

test("intake plan creates thread and task for one-role task", () => {
  const plan = buildTelegramIntakePlan(
    {
      text: "@researcher сравни конкурентов в Варне",
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
      text: "@finance сколько у нас учеников",
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

test("intake plan asks for clarification when routing is ambiguous", () => {
  const plan = buildTelegramIntakePlan(
    {
      text: "Посмотри пожалуйста",
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
