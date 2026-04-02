"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { buildTelegramIntakePlan } = require("../src/telegram-intake");
const { buildTelegramReply } = require("../src/telegram-reply");

function createDeterministicIdFactory() {
  let index = 0;
  return (prefix) => `${prefix}_${++index}`;
}

test("reply keeps clarification human-readable and in the same topic", () => {
  const intakePlan = buildTelegramIntakePlan({
    text: "Посмотри пожалуйста",
    topic_name: "",
    is_group_context: false,
  });

  const reply = buildTelegramReply(intakePlan, {
    topic_name: "",
  });

  assert.equal(reply.target, "same_topic");
  assert.equal(reply.topic_name, null);
  assert.match(reply.text, /Не удалось определить роль/);
});

test("reply for one-role task stays short and does not expose internals", () => {
  const intakePlan = buildTelegramIntakePlan(
    {
      text: "@researcher сравни конкурентов в Варне",
      topic_name: "02 Researcher",
    },
    { idFactory: createDeterministicIdFactory() }
  );

  const reply = buildTelegramReply(intakePlan, {
    topic_name: "02 Researcher",
  });

  assert.equal(reply.text, "Принял. Ставлю задачу ресерчеру.");
  assert.equal(reply.text.includes("thread_"), false);
  assert.equal(reply.text.includes("task_"), false);
});

test("reply for direct answer stays neutral and does not sound like self-handoff", () => {
  const intakePlan = buildTelegramIntakePlan(
    {
      text: "@finance сколько у нас учеников",
      topic_name: "04 Finance",
    },
    { idFactory: createDeterministicIdFactory() }
  );

  const reply = buildTelegramReply(intakePlan, {
    topic_name: "04 Finance",
  });

  assert.equal(reply.text, "Принял. Ответ будет здесь.");
});

test("reply for orchestrator multi-role task stays high-level", () => {
  const intakePlan = buildTelegramIntakePlan(
    {
      text: "@orchestrator собери картину по филиалам и рискам",
      topic_name: "General",
    },
    { idFactory: createDeterministicIdFactory() }
  );

  const reply = buildTelegramReply(intakePlan, {
    topic_name: "General",
  });

  assert.equal(reply.text, "Принял. Оркестратор разложит задачу на шаги и подключит нужные роли.");
});
