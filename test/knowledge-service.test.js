"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  ALLOWED_KNOWLEDGE_CLAIM_STATUSES,
  ALLOWED_KNOWLEDGE_CLAIM_TYPES,
  ALLOWED_KNOWLEDGE_DIRTY_QUEUE_STATUSES,
  ALLOWED_KNOWLEDGE_SCOPES,
  ALLOWED_KNOWLEDGE_SOURCE_TYPES,
  ALLOWED_KNOWLEDGE_SUPPORT_TYPES,
  buildKnowledgeClaimCandidate,
  buildKnowledgeClaimSource,
  buildKnowledgeDirtyQueueItem,
} = require("../src/knowledge-service");

test("knowledge core enums stay aligned with the implementation plan", () => {
  assert.deepEqual(Array.from(ALLOWED_KNOWLEDGE_CLAIM_TYPES), [
    "fact",
    "pattern",
    "risk",
    "preference",
    "hypothesis",
    "decision_projection",
  ]);
  assert.deepEqual(Array.from(ALLOWED_KNOWLEDGE_SCOPES), [
    "owner",
    "business",
    "role",
    "task",
    "branch",
    "program",
    "competitor",
  ]);
  assert.deepEqual(Array.from(ALLOWED_KNOWLEDGE_CLAIM_STATUSES), [
    "candidate",
    "supported",
    "disputed",
    "superseded",
    "archived",
  ]);
  assert.deepEqual(Array.from(ALLOWED_KNOWLEDGE_SOURCE_TYPES), ["memory", "decision", "artifact", "message", "run"]);
  assert.deepEqual(Array.from(ALLOWED_KNOWLEDGE_SUPPORT_TYPES), ["supports", "contradicts", "derived_from"]);
  assert.deepEqual(Array.from(ALLOWED_KNOWLEDGE_DIRTY_QUEUE_STATUSES), ["pending", "processing", "completed", "failed"]);
});

test("buildKnowledgeClaimCandidate normalizes core claim fields", () => {
  const candidate = buildKnowledgeClaimCandidate({
    claim_text: "  Parents in Varna react best to short practical AI examples.  ",
    claim_type: "pattern",
    scope: "business",
    confidence: 0.88,
    freshness_score: "0.75",
  });

  assert.deepEqual(candidate, {
    claim_text: "Parents in Varna react best to short practical AI examples.",
    claim_type: "pattern",
    scope: "business",
    scope_id: null,
    status: "candidate",
    confidence: 0.88,
    freshness_score: 0.75,
  });
});

test("buildKnowledgeClaimCandidate rejects invalid claim metadata", () => {
  assert.throws(
    () =>
      buildKnowledgeClaimCandidate({
        claim_text: "Something",
        claim_type: "summary",
        scope: "business",
      }),
    /Invalid claim_type/
  );

  assert.throws(
    () =>
      buildKnowledgeClaimCandidate({
        claim_text: "Something",
        claim_type: "fact",
        scope: "unknown",
      }),
    /Invalid scope/
  );
});

test("buildKnowledgeClaimSource enforces provenance fields", () => {
  const source = buildKnowledgeClaimSource({
    claim_id: 42,
    source_type: "artifact",
    source_id: "17",
    support_type: "derived_from",
    evidence_snippet: "Research artifact says practical AI examples convert better.",
  });

  assert.deepEqual(source, {
    claim_id: 42,
    source_type: "artifact",
    source_id: "17",
    support_type: "derived_from",
    evidence_snippet: "Research artifact says practical AI examples convert better.",
  });

  assert.throws(
    () =>
      buildKnowledgeClaimSource({
        claim_id: 0,
        source_type: "artifact",
        source_id: "17",
      }),
    /claim_id must be a positive integer/
  );
});

test("buildKnowledgeDirtyQueueItem normalizes slugs, status, and priority", () => {
  const item = buildKnowledgeDirtyQueueItem({
    source_type: "run",
    source_id: "88",
    affected_scope: "task",
    affected_scope_id: "task_123",
    affected_node_slugs: ["Audience-Fit", " audience-fit ", "varna-launch"],
    reason: "New research output changed the active task context.",
    priority: "25",
  });

  assert.deepEqual(item, {
    source_type: "run",
    source_id: "88",
    affected_scope: "task",
    affected_scope_id: "task_123",
    affected_node_slugs: ["audience-fit", "varna-launch"],
    reason: "New research output changed the active task context.",
    priority: 25,
    status: "pending",
  });
});

test("buildKnowledgeDirtyQueueItem rejects invalid node slug payloads", () => {
  assert.throws(
    () =>
      buildKnowledgeDirtyQueueItem({
        source_type: "memory",
        source_id: "9",
        reason: "Need rebuild",
        affected_node_slugs: "varna-launch",
      }),
    /affected_node_slugs must be an array/
  );
});
