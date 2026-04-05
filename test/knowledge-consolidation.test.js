"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildKnowledgeClaimConsolidationPlan,
  determineConsolidatedStatus,
  normalizeClaimTextForComparison,
} = require("../src/knowledge-consolidation");

test("normalizeClaimTextForComparison collapses whitespace and trailing punctuation", () => {
  assert.equal(
    normalizeClaimTextForComparison(" Parents in Varna react best to short AI examples.  "),
    "parents in varna react best to short ai examples"
  );
});

test("buildKnowledgeClaimConsolidationPlan supersedes duplicate task claims and keeps the strongest survivor", () => {
  const plan = buildKnowledgeClaimConsolidationPlan(
    [
      {
        id: 11,
        claim_text: "Parents in Varna react best to short practical AI examples.",
        claim_type: "fact",
        scope: "task",
        scope_id: "task_1",
        status: "candidate",
        confidence: 0.6,
        created_at: "2026-04-05T10:00:00.000Z",
      },
      {
        id: 12,
        claim_text: "Parents in Varna react best to short practical AI examples.",
        claim_type: "fact",
        scope: "task",
        scope_id: "task_1",
        status: "candidate",
        confidence: 0.9,
        created_at: "2026-04-05T10:05:00.000Z",
      },
    ],
    [
      { claim_id: 11, support_type: "derived_from" },
      { claim_id: 12, support_type: "derived_from" },
    ]
  );

  assert.equal(plan.grouped_claim_count, 1);
  assert.equal(plan.duplicate_claim_groups, 1);
  assert.deepEqual(plan.updates, [
    { id: 12, next_status: "supported" },
    { id: 11, next_status: "superseded" },
  ]);
});

test("buildKnowledgeClaimConsolidationPlan keeps identical texts isolated across scopes", () => {
  const plan = buildKnowledgeClaimConsolidationPlan(
    [
      {
        id: 21,
        claim_text: "Founder prefers concise answers.",
        claim_type: "preference",
        scope: "owner",
        scope_id: null,
        status: "candidate",
        confidence: 0.7,
        created_at: "2026-04-05T09:00:00.000Z",
      },
      {
        id: 22,
        claim_text: "Founder prefers concise answers.",
        claim_type: "preference",
        scope: "task",
        scope_id: "task_2",
        status: "candidate",
        confidence: 0.7,
        created_at: "2026-04-05T09:05:00.000Z",
      },
    ],
    [
      { claim_id: 21, support_type: "derived_from" },
      { claim_id: 22, support_type: "derived_from" },
    ]
  );

  assert.equal(plan.grouped_claim_count, 2);
  assert.equal(plan.duplicate_claim_groups, 0);
  assert.deepEqual(plan.updates, [
    { id: 21, next_status: "supported" },
    { id: 22, next_status: "supported" },
  ]);
});

test("determineConsolidatedStatus promotes contradictory evidence to disputed", () => {
  assert.equal(
    determineConsolidatedStatus({
      supports: 0,
      contradicts: 1,
      derived_from: 1,
      total: 2,
    }),
    "disputed"
  );
});

test("buildKnowledgeClaimConsolidationPlan marks claims with contradicting sources as disputed", () => {
  const plan = buildKnowledgeClaimConsolidationPlan(
    [
      {
        id: 31,
        claim_text: "This branch shows a stable demand signal.",
        claim_type: "pattern",
        scope: "business",
        scope_id: null,
        status: "candidate",
        confidence: 0.8,
        created_at: "2026-04-05T11:00:00.000Z",
      },
    ],
    [
      { claim_id: 31, support_type: "derived_from" },
      { claim_id: 31, support_type: "contradicts" },
    ]
  );

  assert.deepEqual(plan.updates, [{ id: 31, next_status: "disputed" }]);
});
