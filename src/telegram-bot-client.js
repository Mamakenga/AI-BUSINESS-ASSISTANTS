"use strict";

function normalizeRequiredString(value, fieldName) {
  const normalized = String(value || "").trim();
  if (!normalized) {
    throw new Error(`${fieldName} is required`);
  }
  return normalized;
}

function normalizeOptionalString(value) {
  if (value === undefined || value === null) {
    return null;
  }
  const normalized = String(value).trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeTelegramBotConfig(env = process.env) {
  const botToken = normalizeRequiredString(env.TELEGRAM_BOT_TOKEN, "TELEGRAM_BOT_TOKEN");
  return {
    bot_token: botToken,
    api_base: `https://api.telegram.org/bot${botToken}`,
  };
}

async function callTelegramApi(method, body, options = {}) {
  const config = options.config || normalizeTelegramBotConfig(options.env);
  const fetchImpl = options.fetchImpl || fetch;

  const response = await fetchImpl(`${config.api_base}/${method}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;

  if (!response.ok || !payload?.ok) {
    throw new Error(`Telegram API ${method} failed: ${response.status} ${text}`);
  }

  return payload.result;
}

function buildTelegramTextMessage(input = {}) {
  const payload = {
    chat_id: normalizeRequiredString(input.chat_id, "chat_id"),
    text: normalizeRequiredString(input.text, "text"),
  };

  const messageThreadId = normalizeOptionalString(input.message_thread_id);
  if (messageThreadId !== null) {
    payload.message_thread_id = Number.parseInt(messageThreadId, 10);
  }

  const replyToMessageId = normalizeOptionalString(input.reply_to_message_id);
  if (replyToMessageId !== null) {
    payload.reply_to_message_id = Number.parseInt(replyToMessageId, 10);
  }

  return payload;
}

module.exports = {
  buildTelegramTextMessage,
  callTelegramApi,
  normalizeTelegramBotConfig,
};
