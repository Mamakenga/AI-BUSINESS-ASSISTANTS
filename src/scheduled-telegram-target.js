"use strict";

const { ROLE_PROFILES } = require("./runtime-profiles");

function normalizeOptionalString(value) {
  if (value === undefined || value === null) {
    return null;
  }
  const normalized = String(value).trim();
  return normalized.length > 0 ? normalized : null;
}

function sortRowsByUpdatedAtDesc(rows = []) {
  return [...rows].sort((left, right) => {
    const leftTime = new Date(left.updated_at || left.created_at || 0).getTime();
    const rightTime = new Date(right.updated_at || right.created_at || 0).getTime();
    return rightTime - leftTime;
  });
}

function resolveScheduledTelegramTarget(input = {}) {
  const run = input.run || {};
  const allowedChatId = normalizeOptionalString(input.allowed_chat_id);
  if (run.requested_by_agent !== "scheduler" || !allowedChatId) {
    return null;
  }

  const roleProfile = ROLE_PROFILES[run.agent];
  const topicName = normalizeOptionalString(roleProfile?.telegram_topic);
  if (!roleProfile || !topicName) {
    return null;
  }

  const topicRows = sortRowsByUpdatedAtDesc(input.telegram_topic_rows || []);

  const topicRow = topicRows.find(
    (row) =>
      normalizeOptionalString(row.chat_id) === allowedChatId &&
      normalizeOptionalString(row.topic_name) === topicName &&
      normalizeOptionalString(row.message_thread_id) !== null
  );

  if (topicRow) {
    return {
      chat_id: allowedChatId,
      message_thread_id: normalizeOptionalString(topicRow.message_thread_id),
      topic_name: topicName,
      target_mode: "role_topic",
    };
  }

  return {
    chat_id: allowedChatId,
    message_thread_id: null,
    topic_name: topicName,
    target_mode: topicName ? "general_chat_fallback" : "general_chat",
  };
}

module.exports = {
  resolveScheduledTelegramTarget,
};
