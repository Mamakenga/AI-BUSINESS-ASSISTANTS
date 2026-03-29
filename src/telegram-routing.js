"use strict";

const ROLE_ALIASES = new Map([
  ["orchestrator", "orchestrator"],
  ["assistant", "assistant"],
  ["researcher", "researcher"],
  ["methodist", "methodist"],
  ["finance", "finance_analyst"],
  ["critic", "critic"],
]);

const TOPIC_ROLE_BY_NAME = new Map([
  ["00 orchestrator", "orchestrator"],
  ["01 assistant", "assistant"],
  ["02 researcher", "researcher"],
  ["03 methodist", "methodist"],
  ["04 finance", "finance_analyst"],
  ["05 critic", "critic"],
  ["general", "orchestrator"],
]);

const QUESTION_STARTERS = [
  "что",
  "какой",
  "какая",
  "какие",
  "когда",
  "где",
  "почему",
  "зачем",
  "сколько",
  "как",
  "what",
  "which",
  "when",
  "where",
  "why",
  "how",
];

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeTopicName(topicName) {
  return normalizeText(topicName).toLowerCase();
}

function extractExplicitRole(text) {
  const normalized = normalizeText(text);
  const match = normalized.match(/@([a-z_]+)/i);
  if (!match) {
    return null;
  }

  return ROLE_ALIASES.get(match[1].toLowerCase()) || null;
}

function resolveTopicRole(topicName) {
  return TOPIC_ROLE_BY_NAME.get(normalizeTopicName(topicName)) || null;
}

function looksLikeQuestion(text) {
  const normalized = normalizeText(text).toLowerCase();
  if (!normalized) {
    return false;
  }
  if (normalized.includes("?")) {
    return true;
  }
  return QUESTION_STARTERS.some((starter) => normalized.startsWith(starter + " "));
}

function classifyInteraction(resolvedRole, text) {
  if (!resolvedRole) {
    return null;
  }
  if (resolvedRole === "orchestrator") {
    return {
      interaction_type: "multi_role_task",
      should_create_task: true,
    };
  }
  if (looksLikeQuestion(text)) {
    return {
      interaction_type: "direct_answer",
      should_create_task: false,
    };
  }
  return {
    interaction_type: "one_role_task",
    should_create_task: true,
  };
}

function resolveTelegramRouting(input) {
  const text = normalizeText(input.text);
  const topicName = normalizeText(input.topic_name);
  const isGroupContext = input.is_group_context !== false;

  const explicitRole = extractExplicitRole(text);
  const topicRole = resolveTopicRole(topicName);
  const resolvedRole = explicitRole || topicRole || null;

  if (!resolvedRole) {
    return {
      text,
      topic_name: topicName || null,
      explicit_role: explicitRole,
      topic_role: topicRole,
      resolved_role: null,
      route_source: null,
      thread_required: isGroupContext || Boolean(text),
      interaction_type: null,
      should_create_task: false,
      needs_clarification: true,
      clarification_message:
        "Не удалось определить роль. Укажите тег роли или напишите в привязанную тему Telegram.",
    };
  }

  const classification = classifyInteraction(resolvedRole, text);

  return {
    text,
    topic_name: topicName || null,
    explicit_role: explicitRole,
    topic_role: topicRole,
    resolved_role: resolvedRole,
    route_source: explicitRole ? "tag" : "topic",
    thread_required: true,
    interaction_type: classification.interaction_type,
    should_create_task: classification.should_create_task,
    needs_clarification: false,
    clarification_message: null,
  };
}

module.exports = {
  ROLE_ALIASES,
  TOPIC_ROLE_BY_NAME,
  resolveTelegramRouting,
};
