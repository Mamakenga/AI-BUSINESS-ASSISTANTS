"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildTelegramApiError,
  buildTelegramTextMessage,
  normalizeTelegramBotConfig,
} = require("../src/telegram-bot-client");

test("normalizeTelegramBotConfig builds Telegram API base from bot token", () => {
  const config = normalizeTelegramBotConfig({
    TELEGRAM_BOT_TOKEN: "123:abc",
  });

  assert.equal(config.bot_token, "123:abc");
  assert.equal(config.api_base, "https://api.telegram.org/bot123:abc");
});

test("buildTelegramTextMessage includes optional thread and reply ids", () => {
  const payload = buildTelegramTextMessage({
    chat_id: "-1003715387997",
    text: "hello",
    message_thread_id: "2",
    reply_to_message_id: "15",
  });

  assert.deepEqual(payload, {
    chat_id: "-1003715387997",
    text: "hello",
    message_thread_id: 2,
    reply_to_message_id: 15,
  });
});

test("buildTelegramApiError includes migrate_to_chat_id recovery hint", () => {
  const error = buildTelegramApiError(
    "sendMessage",
    { status: 400 },
    {
      ok: false,
      error_code: 400,
      description: "Bad Request: group chat was upgraded to a supergroup chat",
      parameters: {
        migrate_to_chat_id: -1003715387997,
      },
    },
    '{"ok":false,"error_code":400,"description":"Bad Request: group chat was upgraded to a supergroup chat","parameters":{"migrate_to_chat_id":-1003715387997}}'
  );

  assert.equal(error.migrate_to_chat_id, "-1003715387997");
  assert.match(error.message, /update TELEGRAM_ALLOWED_CHAT_ID to -1003715387997/);
  assert.match(error.message, /restart ops-telegram\.service plus ops-worker\.service/);
  assert.match(error.message, /send one manual message in each role topic to rebind topic metadata/);
});
