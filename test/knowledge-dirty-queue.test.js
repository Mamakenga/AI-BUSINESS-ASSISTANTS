"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildKnowledgeDirtyQueueRunReport,
  normalizeKnowledgeDirtyQueueBatchSize,
  summarizeKnowledgeDirtyQueueItems,
} = require("../src/knowledge-dirty-queue");

test("normalizeKnowledgeDirtyQueueBatchSize defaults and caps the batch size", () => {
  assert.equal(normalizeKnowledgeDirtyQueueBatchSize(undefined), 25);
  assert.equal(normalizeKnowledgeDirtyQueueBatchSize(5), 5);
  assert.equal(normalizeKnowledgeDirtyQueueBatchSize(500), 100);
  assert.throws(() => normalizeKnowledgeDirtyQueueBatchSize(0), /Invalid knowledge dirty queue batch size/);
});

test("summarizeKnowledgeDirtyQueueItems groups queue items by source type, reason, and scope", () => {
  const summary = summarizeKnowledgeDirtyQueueItems([
    {
      source_type: "artifact",
      reason: "task_run_claim_extraction",
      affected_scope: "task",
    },
    {
      source_type: "artifact",
      reason: "task_run_claim_extraction",
      affected_scope: "task",
    },
    {
      source_type: "run",
      reason: "manual_backfill",
      affected_scope: null,
    },
  ]);

  assert.deepEqual(summary, {
    item_count: 3,
    source_types: {
      artifact: 2,
      run: 1,
    },
    reasons: {
      task_run_claim_extraction: 2,
      manual_backfill: 1,
    },
    scopes: {
      task: 2,
      none: 1,
    },
  });
});

test("buildKnowledgeDirtyQueueRunReport merges queue summary with processing results", () => {
  const report = buildKnowledgeDirtyQueueRunReport({
    queue_rows: [
      {
        source_type: "artifact",
        reason: "task_run_claim_extraction",
        affected_scope: "task",
      },
    ],
    consolidation_updates_applied: 4,
    hygiene_updates_applied: 1,
    archived_by_reason: {
      markdown_heading: 1,
    },
  });

  assert.deepEqual(report, {
    queue_summary: {
      item_count: 1,
      source_types: {
        artifact: 1,
      },
      reasons: {
        task_run_claim_extraction: 1,
      },
      scopes: {
        task: 1,
      },
    },
    consolidation_updates_applied: 4,
    hygiene_updates_applied: 1,
    archived_by_reason: {
      markdown_heading: 1,
    },
  });
});
