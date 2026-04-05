"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildKnowledgeClaimHygienePlan,
  classifyKnowledgeClaimNoise,
  isShortStructuredFragment,
} = require("../src/knowledge-hygiene");

test("classifyKnowledgeClaimNoise detects markdown heading claims", () => {
  assert.equal(classifyKnowledgeClaimNoise("# Черновой каркас мини-курса"), "markdown_heading");
});

test("classifyKnowledgeClaimNoise detects inline markdown heading leftovers", () => {
  assert.equal(
    classifyKnowledgeClaimNoise(
      "Родители детей школьного возраста (7-17 лет), которые хотят понять семейные AI-инструменты. ## Цель курса"
    ),
    "inline_markdown_heading"
  );
});

test("isShortStructuredFragment detects short outline bullets without sentence endings", () => {
  assert.equal(isShortStructuredFragment("Как AI помогает с домашними заданиями (безопасно и осознанно)"), true);
  assert.equal(isShortStructuredFragment("Founder prefers concise answers."), false);
});

test("buildKnowledgeClaimHygienePlan archives only clearly noisy active claims", () => {
  const plan = buildKnowledgeClaimHygienePlan([
    {
      id: 1,
      claim_text: "# Черновой каркас мини-курса для родителей",
      status: "supported",
    },
    {
      id: 2,
      claim_text: "Родители детей школьного возраста понимают роль AI в семейной жизни. ## Цель курса",
      status: "supported",
    },
    {
      id: 3,
      claim_text: "Как AI помогает с домашними заданиями (безопасно и осознанно)",
      status: "supported",
    },
    {
      id: 4,
      claim_text:
        "Родители детей 7-16 лет, которые беспокоятся о влиянии искусственного интеллекта на образование и развитие своих детей. Уровень технической подготовки — базовый или нулевой.",
      status: "supported",
    },
    {
      id: 5,
      claim_text: "# already archived should stay untouched",
      status: "archived",
    },
  ]);

  assert.deepEqual(plan.updates, [
    { id: 1, next_status: "archived", hygiene_reason: "markdown_heading" },
    { id: 2, next_status: "archived", hygiene_reason: "inline_markdown_heading" },
    { id: 3, next_status: "archived", hygiene_reason: "structured_fragment" },
  ]);
  assert.equal(plan.report.archived_count, 3);
  assert.equal(plan.report.reviewed_count, 4);
});
