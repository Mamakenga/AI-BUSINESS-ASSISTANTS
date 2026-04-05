"use strict";

const { normalizeNullableString } = require("./string-normalizers");

function normalizeBoardOrder(value) {
  if (value === undefined) {
    return undefined;
  }
  const parsed = Number.parseInt(String(value), 10);
  if (Number.isNaN(parsed)) {
    throw new Error("Invalid board_order");
  }
  return parsed;
}

function buildTelegramContext(telegramInput) {
  if (!telegramInput || typeof telegramInput !== "object" || Array.isArray(telegramInput)) {
    return null;
  }

  return {
    chat_id: normalizeNullableString(telegramInput.chat_id),
    message_id: normalizeBoardOrder(telegramInput.message_id),
    message_thread_id:
      telegramInput.message_thread_id === null || telegramInput.message_thread_id === undefined
        ? null
        : normalizeBoardOrder(telegramInput.message_thread_id),
    topic_name: normalizeNullableString(telegramInput.topic_name),
  };
}

function resolveTelegramIntakeContext(body = {}, persistedTopicName = null) {
  const text = normalizeNullableString(body.text);
  const requestTopicName = normalizeNullableString(body.topic_name);
  const telegramContext = buildTelegramContext(body.telegram);
  const restoredTopicName = normalizeNullableString(persistedTopicName);

  const topicName = requestTopicName || telegramContext?.topic_name || restoredTopicName || null;

  if (telegramContext && topicName && !telegramContext.topic_name) {
    telegramContext.topic_name = topicName;
  }

  return {
    text,
    topicName,
    telegramContext,
  };
}

module.exports = {
  buildTelegramContext,
  resolveTelegramIntakeContext,
};
