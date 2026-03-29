"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { ALLOWED_MEMORY_SCOPES, buildMemoryCandidate, parseMemoryQuery } = require("../src/memory-service");

test("memory scopes stay limited to the four agreed layers", () => {
  assert.deepEqual(Array.from(ALLOWED_MEMORY_SCOPES), ["owner", "business", "role", "task"]);
});

test("parseMemoryQuery normalizes scope filters and defaults", () => {
  const query = parseMemoryQuery({
    scope: "role",
    scope_id: "researcher",
  });

  assert.deepEqual(query, {
    scope: "role",
    scope_id: "researcher",
    limit: 20,
    include_expired: false,
  });
});

test("buildMemoryCandidate normalizes tags and dates", () => {
  const candidate = buildMemoryCandidate({
    scope: "business",
    fact: "Весной подняли цену в Варне на 10 лв.",
    source: "founder decision",
    confidence: 0.92,
    tags: ["pricing", "varna", " ", "pricing"],
    expires_at: "2026-04-15T09:00:00.000Z",
  });

  assert.equal(candidate.scope, "business");
  assert.equal(candidate.fact, "Весной подняли цену в Варне на 10 лв.");
  assert.equal(candidate.confidence, 0.92);
  assert.deepEqual(candidate.tags, ["pricing", "varna", "pricing"]);
  assert.equal(candidate.expires_at, "2026-04-15T09:00:00.000Z");
});

test("buildMemoryCandidate rejects invalid confidence", () => {
  assert.throws(
    () =>
      buildMemoryCandidate({
        scope: "owner",
        fact: "Founder prefers short answers",
        confidence: 2,
      }),
    /Invalid confidence/
  );
});

test("buildMemoryCandidate rejects non-array tags", () => {
  assert.throws(
    () =>
      buildMemoryCandidate({
        scope: "owner",
        fact: "Founder prefers short answers",
        tags: "style",
      }),
    /tags must be an array/
  );
});
