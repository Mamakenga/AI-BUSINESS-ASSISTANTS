"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { buildTelegramContext, resolveTelegramIntakeContext } = require("../src/telegram-intake-context");

test("buildTelegramContext normalizes telegram metadata", () => {
  const context = buildTelegramContext({
    chat_id: " -1003715387997 ",
    message_id: " 501 ",
    message_thread_id: " 69 ",
    topic_name: " 03 Methodist ",
  });

  assert.deepEqual(context, {
    chat_id: "-1003715387997",
    message_id: 501,
    message_thread_id: 69,
    topic_name: "03 Methodist",
  });
});

test("resolveTelegramIntakeContext restores persisted topic name when live update omits it", () => {
  const context = resolveTelegramIntakeContext(
    {
      text: "@methodist помоги структурировать мини-курс",
      topic_name: null,
      telegram: {
        chat_id: "-1003715387997",
        message_id: 777,
        message_thread_id: 69,
        topic_name: null,
      },
    },
    "03 Methodist"
  );

  assert.equal(context.text, "@methodist помоги структурировать мини-курс");
  assert.equal(context.topicName, "03 Methodist");
  assert.deepEqual(context.telegramContext, {
    chat_id: "-1003715387997",
    message_id: 777,
    message_thread_id: 69,
    topic_name: "03 Methodist",
  });
});

test("resolveTelegramIntakeContext preserves explicit topic names from the request", () => {
  const context = resolveTelegramIntakeContext(
    {
      text: "@researcher есть ли сигналы?",
      topic_name: "02 Researcher",
      telegram: {
        chat_id: "-1003715387997",
        message_id: 778,
        message_thread_id: 31,
        topic_name: null,
      },
    },
    "03 Methodist"
  );

  assert.equal(context.topicName, "02 Researcher");
  assert.deepEqual(context.telegramContext, {
    chat_id: "-1003715387997",
    message_id: 778,
    message_thread_id: 31,
    topic_name: "02 Researcher",
  });
});
