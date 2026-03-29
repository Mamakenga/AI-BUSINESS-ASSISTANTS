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

function normalizeAllowedChatId(value) {
  const normalized = normalizeOptionalString(value);
  if (!normalized) {
    return null;
  }
  return normalized;
}

function parseTelegramTopicMap(value) {
  const normalized = normalizeOptionalString(value);
  if (!normalized) {
    return new Map();
  }

  let parsed;
  try {
    parsed = JSON.parse(normalized);
  } catch {
    throw new Error("TELEGRAM_TOPIC_MAP must be valid JSON");
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("TELEGRAM_TOPIC_MAP must be a JSON object");
  }

  const topicMap = new Map();
  for (const [threadId, topicName] of Object.entries(parsed)) {
    const normalizedThreadId = normalizeRequiredString(threadId, "topic_map thread id");
    const normalizedTopicName = normalizeRequiredString(topicName, `topic_map topic for ${threadId}`);
    topicMap.set(normalizedThreadId, normalizedTopicName);
  }

  return topicMap;
}

function extractIncomingTelegramMessage(update) {
  if (!update || typeof update !== "object") {
    return null;
  }

  const message = update.message || null;
  if (!message || typeof message !== "object") {
    return null;
  }

  if (message.from?.is_bot) {
    return null;
  }

  const text = normalizeOptionalString(message.text);
  if (!text) {
    return null;
  }

  return message;
}

function rememberTelegramTopicMetadata(update, topicMap) {
  if (!(topicMap instanceof Map)) {
    return false;
  }

  const message = update?.message;
  if (!message || !message.is_topic_message || message.message_thread_id === undefined || message.message_thread_id === null) {
    return false;
  }

  const threadId = String(message.message_thread_id);
  const createdName = normalizeOptionalString(message.forum_topic_created?.name);
  if (createdName) {
    topicMap.set(threadId, createdName);
    return true;
  }

  const editedName = normalizeOptionalString(message.forum_topic_edited?.name);
  if (editedName) {
    topicMap.set(threadId, editedName);
    return true;
  }

  return false;
}

function resolveTelegramTopicName(message, topicMap) {
  if (message?.is_topic_message && message.message_thread_id !== undefined && message.message_thread_id !== null) {
    return topicMap.get(String(message.message_thread_id)) || null;
  }

  if (message?.chat?.type === "supergroup" || message?.chat?.type === "group") {
    return "General";
  }

  return null;
}

function buildTelegramIntakeRequest(update, options = {}) {
  const message = extractIncomingTelegramMessage(update);
  if (!message) {
    return null;
  }

  const allowedChatId = normalizeAllowedChatId(options.allowed_chat_id);
  const chatId = String(message.chat?.id ?? "");
  if (!chatId) {
    return null;
  }

  if (allowedChatId && chatId !== allowedChatId) {
    return null;
  }

  const topicMap = options.topic_map instanceof Map ? options.topic_map : new Map();
  const topicName = resolveTelegramTopicName(message, topicMap);
  const isGroupContext = message.chat?.type === "group" || message.chat?.type === "supergroup";

  return {
    telegram: {
      chat_id: chatId,
      message_id: message.message_id,
      message_thread_id: message.message_thread_id ?? null,
      topic_name: topicName,
      is_group_context: isGroupContext,
    },
    intake: {
      text: message.text,
      topic_name: topicName,
      is_group_context: isGroupContext,
    },
  };
}

function buildTelegramSendMessageRequest(telegramContext, intakeResponse) {
  const chatId = normalizeRequiredString(telegramContext?.chat_id, "chat_id");
  const replyText = normalizeRequiredString(intakeResponse?.reply?.text, "reply.text");

  const payload = {
    chat_id: chatId,
    text: replyText,
  };

  if (telegramContext.message_thread_id !== null && telegramContext.message_thread_id !== undefined) {
    payload.message_thread_id = telegramContext.message_thread_id;
  }
  if (telegramContext.message_id !== null && telegramContext.message_id !== undefined) {
    payload.reply_to_message_id = telegramContext.message_id;
  }

  return payload;
}

module.exports = {
  buildTelegramIntakeRequest,
  buildTelegramSendMessageRequest,
  extractIncomingTelegramMessage,
  parseTelegramTopicMap,
  rememberTelegramTopicMetadata,
  resolveTelegramTopicName,
};
