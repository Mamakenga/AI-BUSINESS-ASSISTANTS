"use strict";

function normalizeOptionalString(value) {
  if (value === undefined || value === null) {
    return null;
  }

  const normalized = String(value).trim();
  return normalized.length > 0 ? normalized : null;
}

const INTERNAL_SCOPE_TAG_PATTERN = /\[(?:owner|business|role|task|decision(?::[^\]]+)?)\]/i;
const INTERNAL_IDENTIFIER_PATTERN =
  /\b(?:id|uuid|run_id|task_id|thread_id|memory[_ ]?id|record[_ ]?id)\b\s*[:#]?\s*[a-z0-9-]{4,}\b/i;
const BARE_UUID_PATTERN = /\b[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\b/i;
const RECORD_IDENTIFIER_PATTERN = /\u0437\u0430\u043f\u0438\u0441\u044c\s+[a-f0-9-]{6,}/i;
const INTERNAL_SOURCE_LABEL_PATTERN = /\b(?:memory_curator:[a-z_]+|decision:[a-z_]+|long_term_fact)\b/i;
const METHODIST_INTAKE_LEAD_PATTERN =
  /(?:\u0441\u043d\u0430\u0447\u0430\u043b\u0430\s+\u043e\u0442\u0432\u0435\u0442\u044c\u0442\u0435|\u0434\u043b\u044f\s+\u043d\u0430\u0447\u0430\u043b\u0430\s+\u0443\u0442\u043e\u0447\u043d\u0438\u0442\u0435|\u043c\u043d\u0435\s+\u043d\u0443\u0436\u043d\u043e\s+\u043f\u043e\u043d\u044f\u0442\u044c|\u043d\u0443\u0436\u043d\u043e\s+\u0443\u0442\u043e\u0447\u043d\u0438\u0442\u044c|\u0447\u0442\u043e\u0431\u044b\s+\u0442\u043e\u0447\u043d\u043e\s+\u0441\u0442\u0440\u0443\u043a\u0442\u0443\u0440\u0438\u0440\u043e\u0432\u0430\u0442\u044c|\u043f\u0435\u0440\u0435\u0434\s+\u0442\u0435\u043c\s+\u043a\u0430\u043a\s+\u043f\u0440\u0435\u0434\u043b\u0430\u0433\u0430\u0442\u044c)/i;
const METHODIST_INTAKE_TOPIC_PATTERNS = Object.freeze([
  /\u0446\u0435\u043b\u0435\u0432(?:\u0430\u044f|\u0443\u044e)\s+\u0430\u0443\u0434\u0438\u0442\u043e\u0440\u0438/iu,
  /\u0432\u043e\u0437\u0440\u0430\u0441\u0442/iu,
  /\u0443\u0440\u043e\u0432(?:\u0435\u043d\u044c|\u043d\u044f)\s+\u043f\u043e\u0434\u0433\u043e\u0442\u043e\u0432/iu,
  /\u0444\u043e\u0440\u043c\u0430\u0442/iu,
  /\u0434\u043b\u0438\u0442\u0435\u043b\u044c\u043d\u043e\u0441\u0442/iu,
  /\u0446\u0435\u043b\u044c/iu,
  /\u043e\u0436\u0438\u0434\u0430\u0435\u043c(?:\u044b\u0439|\u044b\u0435)\s+\u0440\u0435\u0437\u0443\u043b\u044c\u0442\u0430\u0442/iu,
  /\u0441\u043a\u043e\u043b\u044c\u043a\u043e\s+(?:\u0437\u0430\u043d\u044f\u0442\u0438|\u0443\u0440\u043e\u043a)/iu,
]);

function countPatternMatches(patterns, value) {
  let count = 0;

  for (const pattern of patterns) {
    if (pattern.test(value)) {
      count += 1;
    }
  }

  return count;
}

function hasMethodistBroadIntakeQuestionnaire(replyText, roleId) {
  if (roleId !== "methodist") {
    return false;
  }

  const normalized = normalizeOptionalString(replyText);
  if (!normalized) {
    return false;
  }

  const questionMarkCount = (normalized.match(/\?/g) || []).length;
  const intakeTopicCount = countPatternMatches(METHODIST_INTAKE_TOPIC_PATTERNS, normalized);

  return METHODIST_INTAKE_LEAD_PATTERN.test(normalized) && questionMarkCount >= 2 && intakeTopicCount >= 3;
}

function findFounderReplyQualityIssues(replyText, options = {}) {
  const normalized = normalizeOptionalString(replyText);
  if (!normalized) {
    return [];
  }

  const roleId = normalizeOptionalString(options.roleId);
  const issues = [];

  if (INTERNAL_SCOPE_TAG_PATTERN.test(normalized)) {
    issues.push("internal_scope_tag");
  }

  if (INTERNAL_IDENTIFIER_PATTERN.test(normalized) || BARE_UUID_PATTERN.test(normalized) || RECORD_IDENTIFIER_PATTERN.test(normalized)) {
    issues.push("internal_identifier");
  }

  if (INTERNAL_SOURCE_LABEL_PATTERN.test(normalized)) {
    issues.push("internal_source_label");
  }

  if (hasMethodistBroadIntakeQuestionnaire(normalized, roleId)) {
    issues.push("methodist_broad_intake");
  }

  return issues;
}

module.exports = {
  findFounderReplyQualityIssues,
};
