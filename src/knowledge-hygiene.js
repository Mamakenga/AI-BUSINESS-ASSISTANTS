"use strict";

const { normalizeNullableString } = require("./string-normalizers");

const ACTIVE_KNOWLEDGE_HYGIENE_STATUSES = new Set(["candidate", "supported", "disputed"]);
const SHORT_STRUCTURED_FRAGMENT_MAX_LENGTH = 90;
const LEADING_MARKDOWN_HEADING_PATTERN = /^#{1,6}\s+/;
const INLINE_MARKDOWN_HEADING_PATTERN = /(?:^|\s)#{1,6}\s+\S/;
const SHORT_INTERROGATIVE_FRAGMENT_PATTERN =
  /^(?:как|что|где|когда|почему|зачем|how|what|where|when|why)\b/i;

function isShortStructuredFragment(text) {
  if (!text || text.length >= SHORT_STRUCTURED_FRAGMENT_MAX_LENGTH) {
    return false;
  }
  if (/[.!?]$/.test(text)) {
    return false;
  }
  if (SHORT_INTERROGATIVE_FRAGMENT_PATTERN.test(text)) {
    return true;
  }
  return /[(:;)]/.test(text);
}

function classifyKnowledgeClaimNoise(claimText) {
  const normalized = normalizeNullableString(claimText);
  if (!normalized) {
    return "empty_claim";
  }
  if (LEADING_MARKDOWN_HEADING_PATTERN.test(normalized)) {
    return "markdown_heading";
  }
  if (INLINE_MARKDOWN_HEADING_PATTERN.test(normalized) && normalized.includes("#")) {
    return "inline_markdown_heading";
  }
  if (isShortStructuredFragment(normalized)) {
    return "structured_fragment";
  }
  return null;
}

function buildKnowledgeClaimHygienePlan(claimRows = []) {
  const activeClaims = (claimRows || []).filter((row) =>
    ACTIVE_KNOWLEDGE_HYGIENE_STATUSES.has(normalizeNullableString(row.status) || "candidate")
  );

  const updates = [];
  const archivedByReason = {
    empty_claim: 0,
    inline_markdown_heading: 0,
    markdown_heading: 0,
    structured_fragment: 0,
  };

  for (const row of activeClaims) {
    const reason = classifyKnowledgeClaimNoise(row.claim_text);
    if (!reason) {
      continue;
    }

    updates.push({
      id: Number.parseInt(String(row.id), 10),
      next_status: "archived",
      hygiene_reason: reason,
    });
    archivedByReason[reason] += 1;
  }

  return {
    updates,
    report: {
      archived_count: updates.length,
      candidate_count: activeClaims.filter((row) => (normalizeNullableString(row.status) || "candidate") === "candidate").length,
      reviewed_count: activeClaims.length,
      archived_by_reason: archivedByReason,
    },
  };
}

module.exports = {
  ACTIVE_KNOWLEDGE_HYGIENE_STATUSES,
  buildKnowledgeClaimHygienePlan,
  classifyKnowledgeClaimNoise,
  isShortStructuredFragment,
};
