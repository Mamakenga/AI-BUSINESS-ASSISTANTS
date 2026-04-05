"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { buildDecisionLookup, mapDecisionRow, mapMemoryRow } = require("../src/memory-routes");

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
