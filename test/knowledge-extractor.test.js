"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  MAX_EXTRACTED_CLAIMS,
  buildKnowledgeExtractionPlan,
  extractClaimTexts,
  inferKnowledgeClaimType,
  selectKnowledgeSourceText,
} = require("../src/knowledge-extractor");

test("inferKnowledgeClaimType maps conservative text patterns to supported claim types", () => {
  assert.equal(inferKnowledgeClaimType("Это повторяющийся паттерн founder requests."), "pattern");
  assert.equal(inferKnowledgeClaimType("Главный риск сейчас в слабом ownership."), "risk");
  assert.equal(inferKnowledgeClaimType("Founder prefers short decision-ready replies."), "preference");
  assert.equal(inferKnowledgeClaimType("Это гипотеза, которую надо проверить позже."), "hypothesis");
  assert.equal(inferKnowledgeClaimType("В Варне есть подтвержденный интерес к short practical AI examples."), "fact");
});

test("extractClaimTexts keeps only concrete declarative statements", () => {
  const claims = extractClaimTexts(`
**Что подтверждено**
- Parents in Varna react best to short practical AI examples.
- There is a repeated pattern of founder urgency around unclear ownership.
- Безопасный следующий шаг
- What should we do next?
`);

  assert.deepEqual(claims, [
    "Parents in Varna react best to short practical AI examples.",
    "There is a repeated pattern of founder urgency around unclear ownership.",
  ]);
  assert.ok(claims.length <= MAX_EXTRACTED_CLAIMS);
});

test("extractClaimTexts skips markdown headings in structured course outlines", () => {
  const claims = extractClaimTexts(`
# Черновой каркас мини-курса для родителей по практическому использованию AI дома

## Целевая аудитория
Родители детей школьного возраста (7-17 лет), которые хотят понять, как безопасно и эффективно использовать AI-инструменты в семейной жизни.

## Цель курса
Дать родителям практические навыки и уверенность в использовании AI для помощи детям в учёбе, организации семейных дел и развития цифровой грамотности.
`);

  assert.deepEqual(claims, [
    "Родители детей школьного возраста (7-17 лет), которые хотят понять, как безопасно и эффективно использовать AI-инструменты в семейной жизни.",
    "Дать родителям практические навыки и уверенность в использовании AI для помощи детям в учёбе, организации семейных дел и развития цифровой грамотности.",
  ]);
});

test("selectKnowledgeSourceText prefers artifact reply_text over top-level reply_text", () => {
  const text = selectKnowledgeSourceText({
    reply_text: "Top-level reply.",
    completion_response: {
      artifact: {
        content: {
          reply_text: "Artifact-derived claim source.",
        },
      },
    },
  });

  assert.equal(text, "Artifact-derived claim source.");
});

test("buildKnowledgeExtractionPlan creates task-scoped claim candidates with provenance", () => {
  const plan = buildKnowledgeExtractionPlan({
    run: {
      id: 88,
      task_id: "task_88",
    },
    reply_text: "Parents in Varna react best to short practical AI examples. There is a repeated pattern of founder urgency around unclear ownership.",
    completion_response: {
      run: {
        status: "completed",
      },
      artifact: {
        id: 17,
        content: {
          reply_text: "Parents in Varna react best to short practical AI examples. There is a repeated pattern of founder urgency around unclear ownership.",
        },
      },
    },
  });

  assert.equal(plan.run_id, 88);
  assert.equal(plan.task_id, "task_88");
  assert.equal(plan.claim_candidates.length, 2);
  assert.deepEqual(plan.claim_candidates[0], {
    claim_text: "Parents in Varna react best to short practical AI examples.",
    claim_type: "fact",
    scope: "task",
    scope_id: "task_88",
    status: "candidate",
    confidence: 0.6,
    freshness_score: 1,
  });
  assert.deepEqual(plan.source_templates, [
    {
      source_type: "artifact",
      source_id: "17",
      support_type: "derived_from",
    },
    {
      source_type: "run",
      source_id: "88",
      support_type: "derived_from",
    },
  ]);
  assert.deepEqual(plan.dirty_queue_item, {
    source_type: "artifact",
    source_id: "17",
    affected_scope: "task",
    affected_scope_id: "task_88",
    affected_node_slugs: [],
    reason: "task_run_claim_extraction",
    priority: 50,
    status: "pending",
  });
});

test("buildKnowledgeExtractionPlan skips task-less or non-completed runs", () => {
  assert.equal(
    buildKnowledgeExtractionPlan({
      run: {
        id: 91,
        task_id: null,
      },
      completion_response: {
        run: {
          status: "completed",
        },
      },
      reply_text: "Useful sentence.",
    }),
    null
  );

  assert.equal(
    buildKnowledgeExtractionPlan({
      run: {
        id: 92,
        task_id: "task_92",
      },
      completion_response: {
        run: {
          status: "failed",
        },
      },
      reply_text: "Useful sentence.",
    }),
    null
  );
});
