"use strict";

const { ROLE_ALIASES, TOPIC_ROLE_BY_NAME } = require("./runtime-profiles");

const QUESTION_STARTERS = [
  "\u0447\u0442\u043e",
  "\u043a\u0430\u043a\u043e\u0439",
  "\u043a\u0430\u043a\u0430\u044f",
  "\u043a\u0430\u043a\u0438\u0435",
  "\u043a\u043e\u0433\u0434\u0430",
  "\u0433\u0434\u0435",
  "\u043f\u043e\u0447\u0435\u043c\u0443",
  "\u0437\u0430\u0447\u0435\u043c",
  "\u0441\u043a\u043e\u043b\u044c\u043a\u043e",
  "\u043a\u0430\u043a",
  "what",
  "which",
  "when",
  "where",
  "why",
  "how",
];
const COMPLEX_DECISION_PATTERNS = [
  "какие есть варианты",
  "какие варианты",
  "какой вариант",
  "что нам делать",
  "что делать",
  "как лучше поступить",
  "как поступить",
  "стоит ли",
  "как решить",
  "как нам решить",
  "выбрать",
  "варианты действий",
  "what are the options",
  "what should we do",
  "which option",
  "how should we proceed",
  "is it worth",
];
const COMPLEX_LENS_GROUPS = [
  ["деньг", "бюдж", "кредит", "аванс", "оплат", "стоим", "cash", "finance", "финанс"],
  ["ребренд", "франшиз", "бренд", "позиционир", "стратег", "рынок", "market"],
  ["риск", "последств", "блок", "удержан", "родител", "коммуникац", "срок", "дедлайн"],
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

function stripLeadingRoleTag(text) {
  return normalizeText(text).replace(/^@[a-z_]+\s*/i, "").trim();
}

function looksLikeQuestion(text) {
  const normalized = stripLeadingRoleTag(text).toLowerCase();
  if (!normalized) {
    return false;
  }
  if (normalized.includes("?")) {
    return true;
  }
  return QUESTION_STARTERS.some((starter) => normalized.startsWith(`${starter} `));
}

function countComplexLensMatches(text) {
  const normalized = stripLeadingRoleTag(text).toLowerCase();
  if (!normalized) {
    return 0;
  }

  return COMPLEX_LENS_GROUPS.filter((group) => group.some((pattern) => normalized.includes(pattern))).length;
}

function isAssistantComplexFounderQuestion(text) {
  const normalized = stripLeadingRoleTag(text).toLowerCase();
  if (!normalized || !looksLikeQuestion(text)) {
    return false;
  }

  const hasDecisionPattern =
    COMPLEX_DECISION_PATTERNS.some((pattern) => normalized.includes(pattern)) ||
    (normalized.includes(" или ") && (normalized.includes("как") || normalized.includes("что") || normalized.includes("какие")));

  if (!hasDecisionPattern) {
    return false;
  }

  return countComplexLensMatches(normalized) >= 2;
}

function classifyInteraction(resolvedRole, text) {
  if (!resolvedRole) {
    return null;
  }
  if (resolvedRole === "orchestrator") {
    if (looksLikeQuestion(text)) {
      return {
        interaction_type: "direct_answer",
        should_create_task: false,
      };
    }
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
  const baseRole = explicitRole || topicRole || null;
  const assistantGateRole =
    baseRole === "assistant" && isAssistantComplexFounderQuestion(text) ? "orchestrator" : null;
  const resolvedRole = assistantGateRole || baseRole;

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
        "\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u043e\u043f\u0440\u0435\u0434\u0435\u043b\u0438\u0442\u044c \u0440\u043e\u043b\u044c. \u041d\u0430\u043f\u0438\u0448\u0438\u0442\u0435 \u043f\u0440\u044f\u043c\u043e \u0432 \u043d\u0443\u0436\u043d\u0443\u044e \u0442\u0435\u043c\u0443 Telegram \u0438\u043b\u0438 \u0443\u043a\u0430\u0436\u0438\u0442\u0435 \u0442\u0435\u0433 \u0440\u043e\u043b\u0438.",
    };
  }

  const classification = classifyInteraction(resolvedRole, text);

  return {
    text,
    topic_name: topicName || null,
    explicit_role: explicitRole,
    topic_role: topicRole,
    resolved_role: resolvedRole,
    route_source: assistantGateRole ? "assistant_gate" : explicitRole ? "tag" : "topic",
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
  isAssistantComplexFounderQuestion,
  resolveTelegramRouting,
};
