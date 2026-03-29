"use strict";

const { ALLOWED_MEMORY_SCOPES } = require("./memory-service");

function normalizeRequiredString(value, fieldName) {
  const normalized = String(value || "").trim();
  if (!normalized) {
    throw new Error(`${fieldName} is required`);
  }
  return normalized;
}

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
  const normalized = normalizeRequiredString(value, "scope");
  if (!ALLOWED_MEMORY_SCOPES.has(normalized)) {
    throw new Error("Invalid memory scope");
  }
  return normalized;
}

function normalizeConfidence(value, fieldName) {
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

function normalizeExpiresAt(value, fieldName) {
  const normalized = normalizeNullableString(value);
  if (normalized === undefined) {
    return undefined;
  }
  if (normalized === null) {
    return null;
  }
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid ${fieldName}`);
  }
  return date.toISOString();
}

function mergeTags(...tagLists) {
  const merged = [];
  for (const list of tagLists) {
    if (!Array.isArray(list)) {
      continue;
    }
    for (const tag of list) {
      const normalized = String(tag || "").trim();
      if (!normalized || merged.includes(normalized)) {
        continue;
      }
      merged.push(normalized);
    }
  }
  return merged;
}

function normalizeTags(value, fieldName) {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new Error(`${fieldName} must be an array`);
  }
  return mergeTags(value);
}

function normalizeSourceMemoryIds(value) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error("source_memory_ids must be a non-empty array");
  }

  return value.map((id) => {
    const parsed = Number.parseInt(String(id), 10);
    if (Number.isNaN(parsed) || parsed <= 0) {
      throw new Error("source_memory_ids must contain positive integers");
    }
    return parsed;
  });
}

function normalizePromotedFacts(value) {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new Error("promoted_facts must be an array");
  }

  return value.map((item, index) => {
    if (typeof item === "string") {
      return {
        fact: normalizeRequiredString(item, `promoted_facts[${index}].fact`),
        confidence: null,
        expires_at: null,
        tags: ["long_term_fact", "memory_curator"],
      };
    }

    if (!item || typeof item !== "object") {
      throw new Error("promoted_facts items must be objects or strings");
    }

    return {
      fact: normalizeRequiredString(item.fact, `promoted_facts[${index}].fact`),
      confidence: normalizeConfidence(item.confidence, `promoted_facts[${index}].confidence`) ?? null,
      expires_at: normalizeExpiresAt(item.expires_at, `promoted_facts[${index}].expires_at`) ?? null,
      tags: mergeTags(["long_term_fact", "memory_curator"], normalizeTags(item.tags, `promoted_facts[${index}].tags`)),
    };
  });
}

function validateSourceRows(sourceRows, scope, scopeId, sourceIds) {
  if (!Array.isArray(sourceRows) || sourceRows.length !== sourceIds.length) {
    throw new Error("source_memory_ids do not match existing memories");
  }

  const rowIds = sourceRows.map((row) => Number.parseInt(String(row.id), 10)).sort((a, b) => a - b);
  const expectedIds = [...sourceIds].sort((a, b) => a - b);

  for (let index = 0; index < expectedIds.length; index += 1) {
    if (rowIds[index] !== expectedIds[index]) {
      throw new Error("source_memory_ids do not match existing memories");
    }
  }

  for (const row of sourceRows) {
    if (row.scope !== scope) {
      throw new Error("source memories must share the requested scope");
    }
    const rowScopeId = row.scope_id ?? null;
    if (rowScopeId !== scopeId) {
      throw new Error("source memories must share the requested scope_id");
    }
  }
}

function buildMemoryCompaction(input = {}, sourceRows = []) {
  const actorAgent = normalizeRequiredString(input.actor_agent, "actor_agent");
  if (actorAgent !== "memory_curator") {
    throw new Error("Only memory_curator can compact memories");
  }

  const scope = normalizeMemoryScope(input.scope);
  const scopeId = normalizeNullableString(input.scope_id) ?? null;
  if ((scope === "role" || scope === "task") && !scopeId) {
    throw new Error("scope_id is required for role/task compaction");
  }

  const sourceMemoryIds = normalizeSourceMemoryIds(input.source_memory_ids);
  validateSourceRows(sourceRows, scope, scopeId, sourceMemoryIds);

  const summary = normalizeRequiredString(input.summary, "summary");
  const summaryTags = mergeTags(["compressed_summary", "memory_curator"], normalizeTags(input.summary_tags, "summary_tags"));
  const promotedFacts = normalizePromotedFacts(input.promoted_facts);
  const archiveSourceMemories = input.archive_source_memories !== false;
  const archivedAt = archiveSourceMemories ? new Date().toISOString() : null;

  const summaryMemory = {
    scope,
    scope_id: scopeId,
    fact: summary,
    source: "memory_curator:summary",
    confidence: normalizeConfidence(input.summary_confidence, "summary_confidence") ?? null,
    tags: summaryTags,
    expires_at: normalizeExpiresAt(input.summary_expires_at, "summary_expires_at") ?? null,
  };

  const promotedMemories = promotedFacts.map((item) => ({
    scope,
    scope_id: scopeId,
    fact: item.fact,
    source: "memory_curator:long_term_fact",
    confidence: item.confidence,
    tags: item.tags,
    expires_at: item.expires_at,
  }));

  const archivedSources = sourceRows.map((row) => ({
    id: Number.parseInt(String(row.id), 10),
    tags: mergeTags(Array.isArray(row.tags) ? row.tags : [], ["compacted_source"]),
    expires_at: archivedAt,
  }));

  return {
    actor_agent: actorAgent,
    scope,
    scope_id: scopeId,
    source_memory_ids: sourceMemoryIds,
    archive_source_memories: archiveSourceMemories,
    summary_memory: summaryMemory,
    promoted_memories: promotedMemories,
    archived_sources: archivedSources,
    report: {
      actor_agent: actorAgent,
      scope,
      scope_id: scopeId,
      source_memory_ids: sourceMemoryIds,
      archive_source_memories: archiveSourceMemories,
      promoted_fact_count: promotedMemories.length,
      summary_tags: summaryTags,
    },
  };
}

module.exports = {
  buildMemoryCompaction,
  normalizeSourceMemoryIds,
};
