"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildSemanticKnowledgeCompilerMessages,
  buildKnowledgePageTitle,
  buildKnowledgeScopePageDraft,
  buildKnowledgeScopePageDraftWithFallback,
  extractJsonObjectFromText,
  groupKnowledgeClaimsForPages,
  normalizeSemanticKnowledgeCompilerResult,
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
    openQuestions: ["What should the next pilot validate first?"],
  });

  assert.match(markdown, /^# business knowledge summary/);
  assert.match(markdown, /## Summary/);
  assert.match(markdown, /## Key Facts/);
  assert.match(markdown, /## Open Questions/);
});

test("buildSemanticKnowledgeCompilerMessages limits supported and disputed claims for prompt input", () => {
  const messages = buildSemanticKnowledgeCompilerMessages({
    scope: "task",
    scope_id: "task_77",
    claims: Array.from({ length: 10 }, (_item, index) => ({
      id: index + 1,
      claim_text: `Supported claim ${index + 1}.`,
      status: "supported",
    })).concat(
      Array.from({ length: 10 }, (_item, index) => ({
        id: index + 101,
        claim_text: `Disputed claim ${index + 1}.`,
        status: "disputed",
      }))
    ),
  });

  assert.equal(messages.supported_claims.length, 8);
  assert.equal(messages.disputed_claims.length, 8);
  assert.match(messages.user_prompt, /Page title: task knowledge summary: task_77/);
  assert.match(messages.system_prompt, /Write all summaries, facts, contradictions, and open questions in Russian\./);
  assert.match(messages.user_prompt, /Write the result in Russian/i);
});

test("extractJsonObjectFromText pulls JSON out of fenced model output", () => {
  const extracted = extractJsonObjectFromText('```json\n{\"summary_short\":\"Short summary.\"}\n```');
  assert.equal(extracted, '{"summary_short":"Short summary."}');
});

test("normalizeSemanticKnowledgeCompilerResult upgrades fallback draft with semantic output", () => {
  const fallbackDraft = buildKnowledgeScopePageDraft({
    scope: "task",
    scope_id: "task_88",
    claims: [
      {
        id: 1,
        claim_text: "Parents in Varna react best to short practical AI examples.",
        status: "supported",
      },
    ],
  });

  const semanticDraft = normalizeSemanticKnowledgeCompilerResult(
    {
      summary_short: "Parents respond best to practical AI examples.",
      summary_full: "Parents respond best to practical AI examples, especially when framed as safe family use cases.",
      key_facts: ["Parents respond best to practical AI examples."],
      contradictions: [],
      open_questions: ["Which age range should the pilot prioritize first?"],
    },
    fallbackDraft
  );

  assert.equal(semanticDraft.version.compiled_by, "knowledge_compiler_semantic_v1");
  assert.equal(semanticDraft.version.summary_short, "Parents respond best to practical AI examples.");
  assert.deepEqual(semanticDraft.version.open_questions_json, ["Which age range should the pilot prioritize first?"]);
  assert.match(semanticDraft.version.compiled_markdown, /## Summary/);
});

test("buildKnowledgeScopePageDraftWithFallback keeps deterministic draft when semantic compiler fails", async () => {
  const draft = await buildKnowledgeScopePageDraftWithFallback(
    {
      scope: "task",
      scope_id: "task_88",
      claims: [
        {
          id: 1,
          claim_text: "Parents in Varna react best to short practical AI examples.",
          status: "supported",
        },
      ],
    },
    {
      compileGroup: async () => {
        throw new Error("semantic compile unavailable");
      },
    }
  );

  assert.equal(draft.version.compiled_by, "knowledge_compiler");
  assert.equal(draft.version.summary_short, "Parents in Varna react best to short practical AI examples.");
});

test("buildKnowledgeScopePageDraftWithFallback uses semantic draft when compiler returns valid JSON", async () => {
  const draft = await buildKnowledgeScopePageDraftWithFallback(
    {
      scope: "task",
      scope_id: "task_91",
      claims: [
        {
          id: 1,
          claim_text: "Parents need short practical AI examples for home use.",
          status: "supported",
        },
        {
          id: 2,
          claim_text: "The target age band is still disputed.",
          status: "disputed",
        },
      ],
    },
    {
      compileGroup: async () => ({
        summary_short: "Parents need short practical AI examples.",
        summary_full: "Parents need short practical AI examples, while the exact age band still needs confirmation.",
        key_facts: ["Parents need short practical AI examples for home use."],
        contradictions: ["The target age band is still disputed."],
        open_questions: ["Which age segment should the first pilot target?"],
      }),
    }
  );

  assert.equal(draft.version.compiled_by, "knowledge_compiler_semantic_v1");
  assert.equal(draft.version.summary_short, "Parents need short practical AI examples.");
  assert.deepEqual(draft.version.contradictions_json, ["The target age band is still disputed."]);
});

test("buildKnowledgeScopePageDraft prioritizes core business context before research gaps", () => {
  const unresolvedClaim =
    "Точные цены конкурентов по городам пока не подтверждены; для уверенных сравнений нужна mystery shopping-проверка.";
  const draft = buildKnowledgeScopePageDraft({
    scope: "business",
    scope_id: null,
    claims: [
      {
        id: 1,
        claim_text: unresolvedClaim,
        status: "supported",
      },
      {
        id: 2,
        claim_text: "Школа детского цифрового образования работает офлайн в Болгарии и выходит из франшизы KIBERone.",
        status: "supported",
      },
      {
        id: 3,
        claim_text:
          "Главный текущий приоритет бизнеса: сначала репозиционирование после выхода из франшизы, затем ребрендинг, затем операционная модернизация.",
        status: "supported",
      },
    ],
  });

  assert.equal(
    draft.version.summary_short,
    "Школа детского цифрового образования работает офлайн в Болгарии и выходит из франшизы KIBERone."
  );
  assert.equal(draft.version.key_facts_json[0], draft.version.summary_short);
  assert.deepEqual(draft.version.open_questions_json, [unresolvedClaim]);
  assert.doesNotMatch(draft.version.summary_short, /mystery shopping/i);
  assert.match(draft.version.compiled_markdown, /## Open Questions/);
});
