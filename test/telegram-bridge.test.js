"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildTelegramIntakeRequest,
  buildTelegramSendMessageRequest,
  parseTelegramTopicMap,
  resolveTelegramTopicName,
} = require("../src/telegram-bridge");

test("parseTelegramTopicMap parses JSON mapping into a Map", () => {
  const topicMap = parseTelegramTopicMap('{"101":"01 Assistant","202":"02 Researcher"}');

  assert.equal(topicMap.get("101"), "01 Assistant");
  assert.equal(topicMap.get("202"), "02 Researcher");
});

test("buildTelegramIntakeRequest resolves mapped topic name for forum topic message", () => {
  const request = buildTelegramIntakeRequest(
    {
      message: {
        message_id: 77,
        text: "@assistant what is urgent today?",
        is_topic_message: true,
        message_thread_id: 101,
        chat: { id: -100123, type: "supergroup" },
        from: { id: 42, is_bot: false },
      },
    },
    {
      allowed_chat_id: "-100123",
      topic_map: parseTelegramTopicMap('{"101":"01 Assistant"}'),
    }
  );

  assert.equal(request.telegram.chat_id, "-100123");
  assert.equal(request.telegram.message_thread_id, 101);
  assert.equal(request.telegram.topic_name, "01 Assistant");
  assert.equal(request.intake.topic_name, "01 Assistant");
  assert.equal(request.intake.is_group_context, true);
});

test("group message without topic falls back to General", () => {
  const topicName = resolveTelegramTopicName(
    {
      chat: { id: -100321, type: "supergroup" },
      is_topic_message: false,
    },
    new Map()
  );

  assert.equal(topicName, "General");
});

test("buildTelegramIntakeRequest ignores messages from non-allowed chats", () => {
  const request = buildTelegramIntakeRequest(
    {
      message: {
        message_id: 1,
        text: "@assistant hello",
        chat: { id: -100999, type: "supergroup" },
        from: { id: 42, is_bot: false },
      },
    },
    {
      allowed_chat_id: "-100123",
      topic_map: new Map(),
    }
  );

  assert.equal(request, null);
});

test("buildTelegramSendMessageRequest keeps reply in the same topic", () => {
  const payload = buildTelegramSendMessageRequest(
    {
      chat_id: "-100123",
      message_thread_id: 202,
    },
    {
      reply: {
        text: "Accepted. Passing the question to the assistant.",
      },
    }
  );

  assert.deepEqual(payload, {
    chat_id: "-100123",
    text: "Accepted. Passing the question to the assistant.",
    message_thread_id: 202,
  });
});
