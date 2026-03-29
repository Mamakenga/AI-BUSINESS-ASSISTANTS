"use strict";

const ROLE_LABELS = new Map([
  ["orchestrator", "оркестратору"],
  ["assistant", "ассистенту"],
  ["researcher", "ресерчеру"],
  ["methodist", "методисту"],
  ["finance_analyst", "финансовому аналитику"],
  ["critic", "критику"],
]);

function normalizeTopicName(topicName) {
  const normalized = String(topicName || "").trim();
  return normalized.length > 0 ? normalized : null;
}

function buildReplyText(intakePlan) {
  if (intakePlan.route.needs_clarification) {
    return intakePlan.route.clarification_message;
  }

  const roleLabel = ROLE_LABELS.get(intakePlan.route.resolved_role) || "нужной роли";

  if (intakePlan.route.interaction_type === "multi_role_task") {
    return "Принял. Оркестратор разложит задачу на шаги и подключит нужные роли.";
  }

  if (intakePlan.route.interaction_type === "direct_answer") {
    return `Принял. Передаю вопрос ${roleLabel}.`;
  }

  return `Принял. Ставлю задачу ${roleLabel}.`;
}

function buildTelegramReply(intakePlan, input = {}) {
  return {
    target: "same_topic",
    topic_name: normalizeTopicName(input.topic_name),
    text: buildReplyText(intakePlan),
  };
}

module.exports = {
  buildTelegramReply,
};
