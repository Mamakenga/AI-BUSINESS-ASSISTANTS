"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildDecisionLookup,
  buildKnowledgePageLookup,
  buildRecentTaskKnowledgePagesLookup,
  isLeaderDigestDispatchReason,
  mapDecisionRow,
  mapKnowledgePageRow,
  mapMemoryRow,
  rankCompiledPageScope,
  shouldLoadRecentTaskCompiledPages,
} = require("../src/memory-routes");

test("mapMemoryRow keeps memory API shape stable", () => {
  const mapped = mapMemoryRow({
    id: 13,
    scope: "business",
    scope_id: null,
    fact: "Parents ask for practical AI use cases.",
    source: "founder_note",
    confidence: 0.9,
    tags: ["parents", "ai"],
    expires_at: null,
    created_at: "2026-04-05T10:00:00.000Z",
  });

  assert.deepEqual(mapped, {
    id: 13,
    scope: "business",
    scope_id: null,
    fact: "Parents ask for practical AI use cases.",
    source: "founder_note",
    confidence: 0.9,
    tags: ["parents", "ai"],
    expires_at: null,
    created_at: "2026-04-05T10:00:00.000Z",
  });
});

test("mapDecisionRow keeps decision API shape stable", () => {
  const mapped = mapDecisionRow({
    id: 21,
    scope: "owner",
    decision: "Keep replies concise and grounded.",
    reasoning: "Founder prefers short decision-ready updates.",
    made_by: "assistant",
    status: "active",
    created_at: "2026-04-05T10:00:00.000Z",
  });

  assert.deepEqual(mapped, {
    id: 21,
    scope: "owner",
    decision: "Keep replies concise and grounded.",
    reasoning: "Founder prefers short decision-ready updates.",
    made_by: "assistant",
    status: "active",
    created_at: "2026-04-05T10:00:00.000Z",
  });
});

test("buildDecisionLookup keeps owner and business decisions global", () => {
  const lookup = buildDecisionLookup("owner", 10);

  assert.deepEqual(lookup.values, ["owner", 10]);
  assert.match(lookup.text, /scope = \$1/);
  assert.match(lookup.text, /scope_id IS NULL/);
  assert.match(lookup.text, /LIMIT \$2/);
});

test("buildDecisionLookup scopes task decisions to the active task", () => {
  const lookup = buildDecisionLookup("task", 7, "task_42");

  assert.deepEqual(lookup.values, ["task", "task_42", 7]);
  assert.match(lookup.text, /scope = \$1/);
  assert.match(lookup.text, /scope_id = \$2/);
  assert.match(lookup.text, /LIMIT \$3/);
});

test("buildDecisionLookup skips task decisions without task_id", () => {
  assert.equal(buildDecisionLookup("task", 7, null), null);
});

test("mapKnowledgePageRow keeps compiled page API shape stable", () => {
  const mapped = mapKnowledgePageRow({
    id: 7,
    page_type: "scope_summary",
    scope: "task",
    scope_id: "task_123",
    title: "task knowledge summary: task_123",
    status: "active",
    updated_at: "2026-04-05T10:00:00.000Z",
    version_no: 2,
    summary_short: "Parents need practical AI examples.",
    summary_full: "Parents need practical AI examples and safe home use cases.",
    key_facts_json: ["Parents need practical AI examples."],
    contradictions_json: [],
    compiled_markdown: "# task knowledge summary: task_123",
  });

  assert.deepEqual(mapped, {
    id: 7,
    page_type: "scope_summary",
    scope: "task",
    scope_id: "task_123",
    title: "task knowledge summary: task_123",
    status: "active",
    updated_at: "2026-04-05T10:00:00.000Z",
    version_no: 2,
    summary_short: "Parents need practical AI examples.",
    summary_full: "Parents need practical AI examples and safe home use cases.",
    key_facts: ["Parents need practical AI examples."],
    contradictions: [],
    compiled_markdown: "# task knowledge summary: task_123",
  });
});

test("buildKnowledgePageLookup scopes owner pages globally", () => {
  const lookup = buildKnowledgePageLookup("owner");

  assert.deepEqual(lookup.values, ["owner"]);
  assert.match(lookup.text, /p\.page_type = 'scope_summary'/);
  assert.match(lookup.text, /p\.scope = \$1/);
  assert.match(lookup.text, /p\.scope_id IS NULL/);
});

test("buildKnowledgePageLookup scopes task pages to the active task", () => {
  const lookup = buildKnowledgePageLookup("task", "task_42");

  assert.deepEqual(lookup.values, ["task", "task_42"]);
  assert.match(lookup.text, /p\.scope = \$1/);
  assert.match(lookup.text, /p\.scope_id = \$2/);
});

test("buildRecentTaskKnowledgePagesLookup pulls recent task scope pages globally", () => {
  const lookup = buildRecentTaskKnowledgePagesLookup();

  assert.deepEqual(lookup.values, [2]);
  assert.match(lookup.text, /p\.scope = 'task'/);
  assert.match(lookup.text, /p\.scope_id IS NOT NULL/);
  assert.match(lookup.text, /LIMIT \$1/);
});

test("isLeaderDigestDispatchReason detects only leader brief and digest requests", () => {
  assert.equal(isLeaderDigestDispatchReason("Prepare the daily brief for the leader in Russian."), true);
  assert.equal(isLeaderDigestDispatchReason("Prepare the weekly digest for the leader in Russian."), true);
  assert.equal(isLeaderDigestDispatchReason("Run the daily competitor watch in Russian."), false);
});

test("shouldLoadRecentTaskCompiledPages only enables fallback for empty assistant leader digests", () => {
  assert.equal(
    shouldLoadRecentTaskCompiledPages({
      role_id: "assistant",
      task_id: null,
      requested_by_agent: "scheduler",
      dispatch_reason: "Prepare the daily brief for the leader in Russian.",
      compiled_pages_count: 0,
    }),
    true
  );

  assert.equal(
    shouldLoadRecentTaskCompiledPages({
      role_id: "assistant",
      task_id: null,
      requested_by_agent: "scheduler",
      dispatch_reason: "Prepare the weekly digest for the leader in Russian.",
      compiled_pages_count: 1,
    }),
    false
  );

  assert.equal(
    shouldLoadRecentTaskCompiledPages({
      role_id: "assistant",
      task_id: "task_42",
      requested_by_agent: "scheduler",
      dispatch_reason: "Prepare the weekly digest for the leader in Russian.",
      compiled_pages_count: 0,
    }),
    false
  );

  assert.equal(
    shouldLoadRecentTaskCompiledPages({
      role_id: "researcher",
      task_id: null,
      requested_by_agent: "scheduler",
      dispatch_reason: "Prepare the weekly digest for the leader in Russian.",
      compiled_pages_count: 0,
    }),
    false
  );
});

test("rankCompiledPageScope prioritizes task pages over broader scopes", () => {
  assert.equal(rankCompiledPageScope("task"), 0);
  assert.equal(rankCompiledPageScope("role"), 1);
  assert.equal(rankCompiledPageScope("business"), 2);
  assert.equal(rankCompiledPageScope("owner"), 3);
});
