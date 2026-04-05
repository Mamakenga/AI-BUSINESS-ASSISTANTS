"use strict";

function normalizeKnowledgeDirtyQueueBatchSize(value) {
  if (value === undefined) {
    return 25;
  }

  const parsed = Number.parseInt(String(value || ""), 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error("Invalid knowledge dirty queue batch size");
  }

  return Math.min(parsed, 100);
}

function summarizeKnowledgeDirtyQueueItems(rows = []) {
  const summary = {
    item_count: 0,
    source_types: {},
    reasons: {},
    scopes: {},
  };

  for (const row of rows || []) {
    summary.item_count += 1;

    const sourceType = String(row.source_type || "unknown");
    summary.source_types[sourceType] = (summary.source_types[sourceType] || 0) + 1;

    const reason = String(row.reason || "unknown");
    summary.reasons[reason] = (summary.reasons[reason] || 0) + 1;

    const scope = String(row.affected_scope || "none");
    summary.scopes[scope] = (summary.scopes[scope] || 0) + 1;
  }

  return summary;
}

function buildKnowledgeDirtyQueueRunReport({
  queue_rows: queueRows = [],
  consolidation_updates_applied = 0,
  hygiene_updates_applied = 0,
  archived_by_reason = {},
} = {}) {
  return {
    queue_summary: summarizeKnowledgeDirtyQueueItems(queueRows),
    consolidation_updates_applied,
    hygiene_updates_applied,
    archived_by_reason,
  };
}

module.exports = {
  buildKnowledgeDirtyQueueRunReport,
  normalizeKnowledgeDirtyQueueBatchSize,
  summarizeKnowledgeDirtyQueueItems,
};
