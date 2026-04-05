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
      text: "@methodist \u043f\u043e\u043c\u043e\u0433\u0438 \u0441\u0442\u0440\u0443\u043a\u0442\u0443\u0440\u0438\u0440\u043e\u0432\u0430\u0442\u044c \u043c\u0438\u043d\u0438-\u043a\u0443\u0440\u0441",
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

  assert.equal(
    context.text,
    "@methodist \u043f\u043e\u043c\u043e\u0433\u0438 \u0441\u0442\u0440\u0443\u043a\u0442\u0443\u0440\u0438\u0440\u043e\u0432\u0430\u0442\u044c \u043c\u0438\u043d\u0438-\u043a\u0443\u0440\u0441"
  );
  assert.equal(context.topicName, "03 Methodist");
  assert.deepEqual(context.telegramContext, {
    chat_id: "-1003715387997",
    message_id: 777,
    message_thread_id: 69,
    topic_name: "03 Methodist",
  });
});

test("resolveTelegramIntakeContext supports same-topic routing when tag is omitted", () => {
  const context = resolveTelegramIntakeContext(
    {
      text: "\u041f\u043e\u043c\u043e\u0433\u0438 \u0441\u0442\u0440\u0443\u043a\u0442\u0443\u0440\u0438\u0440\u043e\u0432\u0430\u0442\u044c \u043c\u0438\u043d\u0438-\u043a\u0443\u0440\u0441",
      topic_name: null,
      telegram: {
        chat_id: "-1003715387997",
        message_id: 779,
        message_thread_id: 69,
        topic_name: null,
      },
    },
    "03 Methodist"
  );

  assert.equal(context.text, "\u041f\u043e\u043c\u043e\u0433\u0438 \u0441\u0442\u0440\u0443\u043a\u0442\u0443\u0440\u0438\u0440\u043e\u0432\u0430\u0442\u044c \u043c\u0438\u043d\u0438-\u043a\u0443\u0440\u0441");
  assert.equal(context.topicName, "03 Methodist");
  assert.deepEqual(context.telegramContext, {
    chat_id: "-1003715387997",
    message_id: 779,
    message_thread_id: 69,
    topic_name: "03 Methodist",
  });
});

test("resolveTelegramIntakeContext preserves explicit topic names from the request", () => {
  const context = resolveTelegramIntakeContext(
    {
      text: "@researcher \u0435\u0441\u0442\u044c \u043b\u0438 \u0441\u0438\u0433\u043d\u0430\u043b\u044b?",
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
