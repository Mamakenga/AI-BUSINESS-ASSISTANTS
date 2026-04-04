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
const RECORD_IDENTIFIER_PATTERN = /запись\s+[a-f0-9-]{6,}/i;
const INTERNAL_SOURCE_LABEL_PATTERN = /\b(?:memory_curator:[a-z_]+|decision:[a-z_]+|long_term_fact)\b/i;

function findFounderReplyQualityIssues(replyText) {
  const normalized = normalizeOptionalString(replyText);
  if (!normalized) {
    return [];
  }

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

  return issues;
}

module.exports = {
  findFounderReplyQualityIssues,
};
