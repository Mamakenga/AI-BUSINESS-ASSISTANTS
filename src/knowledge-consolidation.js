"use strict";

const { normalizeNullableString } = require("./string-normalizers");

const ACTIVE_KNOWLEDGE_CLAIM_STATUSES = new Set(["candidate", "supported", "disputed"]);

function normalizeClaimTextForComparison(value) {
  const normalized = normalizeNullableString(value);
  if (!normalized) {
    return null;
  }

  return normalized
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[.!?]+$/g, "")
    .trim();
}

function normalizeClaimScopeId(value) {
  return normalizeNullableString(value) ?? null;
}

function buildClaimBucketKey(row) {
  return JSON.stringify([
    normalizeNullableString(row.scope) ?? null,
    normalizeClaimScopeId(row.scope_id),
    normalizeNullableString(row.claim_type) ?? null,
    normalizeClaimTextForComparison(row.claim_text),
  ]);
}

function parseTimestamp(value) {
  const date = new Date(String(value || ""));
  const timestamp = date.getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function compareClaimPriority(left, right) {
  const leftConfidence = Number(left.confidence ?? -1);
  const rightConfidence = Number(right.confidence ?? -1);
  if (leftConfidence !== rightConfidence) {
    return rightConfidence - leftConfidence;
  }

  const leftCreatedAt = parseTimestamp(left.created_at);
  const rightCreatedAt = parseTimestamp(right.created_at);
  if (leftCreatedAt !== rightCreatedAt) {
    return rightCreatedAt - leftCreatedAt;
  }

  return Number(right.id) - Number(left.id);
}

function buildSourceSupportIndex(sourceRows = []) {
  const index = new Map();

  for (const row of sourceRows) {
    const claimId = Number.parseInt(String(row.claim_id), 10);
    if (!Number.isInteger(claimId) || claimId <= 0) {
      continue;
    }

    const item = index.get(claimId) || {
      supports: 0,
      contradicts: 0,
      derived_from: 0,
      total: 0,
    };

    const supportType = normalizeNullableString(row.support_type) || "supports";
    if (supportType === "supports" || supportType === "contradicts" || supportType === "derived_from") {
      item[supportType] += 1;
    }
    item.total += 1;
    index.set(claimId, item);
  }

  return index;
}

function determineConsolidatedStatus(sourceSupport) {
  if (!sourceSupport || sourceSupport.total === 0) {
    return "candidate";
  }
  if (sourceSupport.contradicts > 0) {
    return "disputed";
  }
  return "supported";
}

function buildKnowledgeClaimConsolidationPlan(claimRows = [], sourceRows = []) {
  const activeClaims = (claimRows || []).filter((row) =>
    ACTIVE_KNOWLEDGE_CLAIM_STATUSES.has(normalizeNullableString(row.status) || "candidate")
  );

  if (activeClaims.length === 0) {
    return {
      updates: [],
      grouped_claim_count: 0,
      duplicate_claim_groups: 0,
      report: {
        candidate_count: 0,
        supported_count: 0,
        disputed_count: 0,
        superseded_count: 0,
        untouched_count: 0,
      },
    };
  }

  const supportIndex = buildSourceSupportIndex(sourceRows);
  const buckets = new Map();

  for (const row of activeClaims) {
    const key = buildClaimBucketKey(row);
    if (!key.includes("\"")) {
      continue;
    }

    const bucket = buckets.get(key) || [];
    bucket.push(row);
    buckets.set(key, bucket);
  }

  const updates = [];
  let duplicateClaimGroups = 0;
  let supportedCount = 0;
  let disputedCount = 0;
  let supersededCount = 0;
  let untouchedCount = 0;

  for (const bucketRows of buckets.values()) {
    const orderedRows = [...bucketRows].sort(compareClaimPriority);
    const survivor = orderedRows[0];
    const survivorSupport = supportIndex.get(Number.parseInt(String(survivor.id), 10)) || null;
    const survivorStatus = determineConsolidatedStatus(survivorSupport);
    const currentStatus = normalizeNullableString(survivor.status) || "candidate";

    if (orderedRows.length > 1) {
      duplicateClaimGroups += 1;
    }

    if (currentStatus !== survivorStatus || currentStatus === "candidate") {
      updates.push({
        id: Number.parseInt(String(survivor.id), 10),
        next_status: survivorStatus,
      });
      if (survivorStatus === "supported") {
        supportedCount += 1;
      } else if (survivorStatus === "disputed") {
        disputedCount += 1;
      }
    } else {
      untouchedCount += 1;
    }

    for (const duplicate of orderedRows.slice(1)) {
      const duplicateStatus = normalizeNullableString(duplicate.status) || "candidate";
      if (duplicateStatus !== "superseded") {
        updates.push({
          id: Number.parseInt(String(duplicate.id), 10),
          next_status: "superseded",
        });
        supersededCount += 1;
      } else {
        untouchedCount += 1;
      }
    }
  }

  return {
    updates,
    grouped_claim_count: buckets.size,
    duplicate_claim_groups: duplicateClaimGroups,
    report: {
      candidate_count: activeClaims.filter((row) => (normalizeNullableString(row.status) || "candidate") === "candidate").length,
      supported_count: supportedCount,
      disputed_count: disputedCount,
      superseded_count: supersededCount,
      untouched_count: untouchedCount,
    },
  };
}

module.exports = {
  ACTIVE_KNOWLEDGE_CLAIM_STATUSES,
  buildKnowledgeClaimConsolidationPlan,
  buildSourceSupportIndex,
  determineConsolidatedStatus,
  normalizeClaimTextForComparison,
};
