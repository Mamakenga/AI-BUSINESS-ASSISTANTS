"use strict";

const { ROLE_LABELS_DATIVE, ROLE_PROFILES } = require("./runtime-profiles");

function normalizeTopicName(topicName) {
  const normalized = String(topicName || "").trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeTopicKey(topicName) {
  const normalized = normalizeTopicName(topicName);
  return normalized ? normalized.toLowerCase() : null;
}

function shouldSkipIntermediateAck(intakePlan, input = {}) {
  if (intakePlan.route.interaction_type === "direct_answer") {
    return true;
  }

  if (intakePlan.route.interaction_type !== "one_role_task") {
    return false;
  }

  const activeTopic = normalizeTopicKey(input.topic_name);
  const roleTopic = normalizeTopicKey(ROLE_PROFILES[intakePlan.route.resolved_role]?.telegram_topic);
  return Boolean(activeTopic && roleTopic && activeTopic === roleTopic);
}

function buildReplyText(intakePlan, input = {}) {
  if (intakePlan.route.needs_clarification) {
    return intakePlan.route.clarification_message;
  }

  const roleLabel = ROLE_LABELS_DATIVE.get(intakePlan.route.resolved_role) || "нужной роли";

  if (intakePlan.route.interaction_type === "multi_role_task") {
    return "Принял. Оркестратор разложит задачу на шаги и подключит нужные роли.";
  }

  if (shouldSkipIntermediateAck(intakePlan, input)) {
    return null;
  }

  return `Принял. Ставлю задачу ${roleLabel}.`;
}

function buildTelegramReply(intakePlan, input = {}) {
  return {
    target: "same_topic",
    topic_name: normalizeTopicName(input.topic_name),
    text: buildReplyText(intakePlan, input),
  };
}

module.exports = {
  buildTelegramReply,
};
