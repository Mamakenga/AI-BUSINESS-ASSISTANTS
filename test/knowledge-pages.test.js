"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildKnowledgePageTitle,
  buildKnowledgeScopePageDraft,
  groupKnowledgeClaimsForPages,
  renderKnowledgePageMarkdown,
} = require("../src/knowledge-pages");

test("buildKnowledgePageTitle renders scope summaries with or without scope_id", () => {
  assert.equal(buildKnowledgePageTitle("business", null), "business knowledge summary");
  assert.equal(buildKnowledgePageTitle("task", "task_42"), "task knowledge summary: task_42");
});

test("groupKnowledgeClaimsForPages keeps supported and disputed claims grouped by scope", () => {
  const groups = groupKnowledgeClaimsForPages([
    {
      id: 1,
      claim_text: "Founder prefers concise answers.",
      scope: "owner",
      scope_id: null,
      status: "supported",
    },
    {
      id: 2,
      claim_text: "This branch shows a stable demand signal.",
      scope: "business",
      scope_id: null,
      status: "disputed",
    },
    {
      id: 3,
      claim_text: "Noise candidate",
      scope: "business",
      scope_id: null,
      status: "candidate",
    },
  ]);

  assert.equal(groups.length, 2);
  assert.deepEqual(groups[0], {
    scope: "business",
    scope_id: null,
    claims: [
      {
        id: 2,
        claim_text: "This branch shows a stable demand signal.",
        status: "disputed",
        created_at: null,
      },
    ],
  });
});

test("buildKnowledgeScopePageDraft builds a scope summary with facts and contradictions", () => {
  const draft = buildKnowledgeScopePageDraft({
    scope: "task",
    scope_id: "task_88",
    claims: [
      {
        id: 1,
        claim_text: "Parents in Varna react best to short practical AI examples.",
        status: "supported",
      },
      {
        id: 2,
        claim_text: "This branch shows a stable demand signal.",
        status: "disputed",
      },
    ],
  });

  assert.equal(draft.page_type, "scope_summary");
  assert.equal(draft.scope, "task");
  assert.equal(draft.scope_id, "task_88");
  assert.equal(draft.title, "task knowledge summary: task_88");
  assert.equal(draft.version.summary_short, "Parents in Varna react best to short practical AI examples.");
  assert.deepEqual(draft.version.key_facts_json, ["Parents in Varna react best to short practical AI examples."]);
  assert.deepEqual(draft.version.contradictions_json, ["This branch shows a stable demand signal."]);
  assert.match(draft.version.compiled_markdown, /## Key Facts/);
  assert.match(draft.version.compiled_markdown, /## Contradictions/);
});

test("renderKnowledgePageMarkdown keeps summary-first structure", () => {
  const markdown = renderKnowledgePageMarkdown({
    title: "business knowledge summary",
    summaryFull: "Founder preferences are stable.",
    keyFacts: ["Founder prefers concise answers."],
    contradictions: [],
  });

  assert.match(markdown, /^# business knowledge summary/);
  assert.match(markdown, /## Summary/);
  assert.match(markdown, /## Key Facts/);
});
