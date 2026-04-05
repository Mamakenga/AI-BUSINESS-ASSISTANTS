"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { mapDecisionRow, mapMemoryRow } = require("../src/memory-routes");

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
