"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildTelegramTextMessage,
  normalizeTelegramBotConfig,
} = require("../src/telegram-bot-client");

test("normalizeTelegramBotConfig requires TELEGRAM_BOT_TOKEN", () => {
  assert.throws(() => normalizeTelegramBotConfig({}), /TELEGRAM_BOT_TOKEN is required/);
});

test("buildTelegramTextMessage keeps topic and reply binding", () => {
  const payload = buildTelegramTextMessage({
    chat_id: "-100123",
    message_thread_id: 101,
    reply_to_message_id: 77,
    text: "Completed. Sending the result back.",
  });

  assert.deepEqual(payload, {
    chat_id: "-100123",
    message_thread_id: 101,
    reply_to_message_id: 77,
    text: "Completed. Sending the result back.",
  });
});
