"use strict";

const ALLOWED_MEMORY_SCOPES = new Set(["owner", "business", "role", "task"]);

function normalizeNullableString(value) {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  const normalized = String(value).trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeMemoryScope(value) {
  const normalized = normalizeNullableString(value);
  if (!normalized || !ALLOWED_MEMORY_SCOPES.has(normalized)) {
    throw new Error("Invalid memory scope");
  }
  return normalized;
}

function normalizeFact(value) {
  const normalized = normalizeNullableString(value);
  if (!normalized) {
    throw new Error("fact is required");
  }
  return normalized;
}

function normalizeConfidence(value) {
  if (value === undefined) {
    return undefined;
  }
  if (value === null || value === "") {
    return null;
  }
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0 || numeric > 1) {
    throw new Error("Invalid confidence");
  }
  return numeric;
}

function normalizeTags(value) {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new Error("tags must be an array");
  }

  return value
    .map((tag) => String(tag || "").trim())
    .filter((tag) => tag.length > 0);
}

function normalizeExpiresAt(value) {
  const normalized = normalizeNullableString(value);
  if (normalized === undefined) {
    return undefined;
  }
  if (normalized === null) {
    return null;
  }
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) {
    throw new Error("Invalid expires_at");
  }
  return date.toISOString();
}

function parseMemoryQuery(input = {}) {
  return {
    scope: normalizeMemoryScope(input.scope),
    scope_id: normalizeNullableString(input.scope_id) ?? null,
    limit: parseLimit(input.limit, 20, 100),
    include_expired: input.include_expired === true,
  };
}

function buildMemoryCandidate(input = {}) {
  return {
    scope: normalizeMemoryScope(input.scope),
    scope_id: normalizeNullableString(input.scope_id) ?? null,
    fact: normalizeFact(input.fact),
    source: normalizeNullableString(input.source) ?? null,
    confidence: normalizeConfidence(input.confidence) ?? null,
    tags: normalizeTags(input.tags),
    expires_at: normalizeExpiresAt(input.expires_at) ?? null,
  };
}

function parseLimit(value, fallback = 20, max = 100) {
  const parsed = Number.parseInt(value || "", 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.min(parsed, max);
}

module.exports = {
  ALLOWED_MEMORY_SCOPES,
  buildMemoryCandidate,
  parseMemoryQuery,
};
