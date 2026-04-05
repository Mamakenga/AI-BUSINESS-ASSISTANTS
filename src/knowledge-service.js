"use strict";

const { normalizeNullableString } = require("./string-normalizers");

const ALLOWED_KNOWLEDGE_CLAIM_TYPES = new Set([
  "fact",
  "pattern",
  "risk",
  "preference",
  "hypothesis",
  "decision_projection",
]);

const ALLOWED_KNOWLEDGE_SCOPES = new Set([
  "owner",
  "business",
  "role",
  "task",
  "branch",
  "program",
  "competitor",
]);

const ALLOWED_KNOWLEDGE_CLAIM_STATUSES = new Set([
  "candidate",
  "supported",
  "disputed",
  "superseded",
  "archived",
]);

const ALLOWED_KNOWLEDGE_SOURCE_TYPES = new Set(["memory", "decision", "artifact", "message", "run"]);
const ALLOWED_KNOWLEDGE_SUPPORT_TYPES = new Set(["supports", "contradicts", "derived_from"]);
const ALLOWED_KNOWLEDGE_DIRTY_QUEUE_STATUSES = new Set(["pending", "processing", "completed", "failed"]);

function normalizeAllowedString(value, fieldName, allowedValues) {
  const normalized = normalizeNullableString(value);
  if (!normalized || !allowedValues.has(normalized)) {
    throw new Error(`Invalid ${fieldName}`);
  }
  return normalized;
}

function normalizeClaimText(value) {
  const normalized = normalizeNullableString(value);
  if (!normalized) {
    throw new Error("claim_text is required");
  }
  return normalized;
}

function normalizeScore(value, fieldName) {
  if (value === undefined) {
    return undefined;
  }
  if (value === null || value === "") {
    return null;
  }
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0 || numeric > 1) {
    throw new Error(`Invalid ${fieldName}`);
  }
  return numeric;
}

function normalizePositiveInteger(value, fieldName) {
  const numeric = Number.parseInt(String(value || ""), 10);
  if (!Number.isInteger(numeric) || numeric <= 0) {
    throw new Error(`${fieldName} must be a positive integer`);
  }
  return numeric;
}

function normalizeNodeSlugs(value) {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new Error("affected_node_slugs must be an array");
  }

  const seen = new Set();
  const normalized = [];
  for (const item of value) {
    const slug = String(item || "").trim().toLowerCase();
    if (!slug || seen.has(slug)) {
      continue;
    }
    seen.add(slug);
    normalized.push(slug);
  }
  return normalized;
}

function normalizePriority(value) {
  if (value === undefined) {
    return 100;
  }
  const numeric = Number.parseInt(String(value || ""), 10);
  if (!Number.isInteger(numeric) || numeric < 0 || numeric > 1000) {
    throw new Error("Invalid priority");
  }
  return numeric;
}

function buildKnowledgeClaimCandidate(input = {}) {
  return {
    claim_text: normalizeClaimText(input.claim_text),
    claim_type: normalizeAllowedString(input.claim_type, "claim_type", ALLOWED_KNOWLEDGE_CLAIM_TYPES),
    scope: normalizeAllowedString(input.scope, "scope", ALLOWED_KNOWLEDGE_SCOPES),
    scope_id: normalizeNullableString(input.scope_id) ?? null,
    status:
      normalizeNullableString(input.status) === undefined
        ? "candidate"
        : normalizeAllowedString(input.status, "status", ALLOWED_KNOWLEDGE_CLAIM_STATUSES),
    confidence: normalizeScore(input.confidence, "confidence") ?? null,
    freshness_score: normalizeScore(input.freshness_score, "freshness_score") ?? null,
  };
}

function buildKnowledgeClaimSource(input = {}) {
  return {
    claim_id: normalizePositiveInteger(input.claim_id, "claim_id"),
    source_type: normalizeAllowedString(input.source_type, "source_type", ALLOWED_KNOWLEDGE_SOURCE_TYPES),
    source_id: normalizeClaimText(input.source_id).trim(),
    support_type:
      normalizeNullableString(input.support_type) === undefined
        ? "supports"
        : normalizeAllowedString(input.support_type, "support_type", ALLOWED_KNOWLEDGE_SUPPORT_TYPES),
    evidence_snippet: normalizeNullableString(input.evidence_snippet) ?? null,
  };
}

function buildKnowledgeDirtyQueueItem(input = {}) {
  return {
    source_type: normalizeAllowedString(input.source_type, "source_type", ALLOWED_KNOWLEDGE_SOURCE_TYPES),
    source_id: normalizeClaimText(input.source_id).trim(),
    affected_scope: normalizeNullableString(input.affected_scope)
      ? normalizeAllowedString(input.affected_scope, "affected_scope", ALLOWED_KNOWLEDGE_SCOPES)
      : null,
    affected_scope_id: normalizeNullableString(input.affected_scope_id) ?? null,
    affected_node_slugs: normalizeNodeSlugs(input.affected_node_slugs),
    reason: normalizeClaimText(input.reason),
    priority: normalizePriority(input.priority),
    status:
      normalizeNullableString(input.status) === undefined
        ? "pending"
        : normalizeAllowedString(input.status, "status", ALLOWED_KNOWLEDGE_DIRTY_QUEUE_STATUSES),
  };
}

module.exports = {
  ALLOWED_KNOWLEDGE_CLAIM_STATUSES,
  ALLOWED_KNOWLEDGE_CLAIM_TYPES,
  ALLOWED_KNOWLEDGE_DIRTY_QUEUE_STATUSES,
  ALLOWED_KNOWLEDGE_SCOPES,
  ALLOWED_KNOWLEDGE_SOURCE_TYPES,
  ALLOWED_KNOWLEDGE_SUPPORT_TYPES,
  buildKnowledgeClaimCandidate,
  buildKnowledgeClaimSource,
  buildKnowledgeDirtyQueueItem,
};
