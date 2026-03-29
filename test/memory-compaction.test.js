"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { buildMemoryCompaction } = require("../src/memory-compaction");

test("memory_curator compaction creates summary and long-term facts for one scope", () => {
  const compaction = buildMemoryCompaction(
    {
      actor_agent: "memory_curator",
      scope: "business",
      source_memory_ids: [11, 12],
      summary: "Pricing notes compressed into a single summary.",
      promoted_facts: [
        {
          fact: "Varna pricing was increased by 10 lv in spring.",
          confidence: 0.91,
          tags: ["pricing", "varna"],
        },
      ],
    },
    [
      { id: 11, scope: "business", scope_id: null, tags: ["raw_note"] },
      { id: 12, scope: "business", scope_id: null, tags: ["raw_note", "pricing"] },
    ]
  );

  assert.equal(compaction.scope, "business");
  assert.equal(compaction.scope_id, null);
  assert.equal(compaction.summary_memory.source, "memory_curator:summary");
  assert.deepEqual(compaction.summary_memory.tags, ["compressed_summary", "memory_curator"]);
  assert.equal(compaction.promoted_memories.length, 1);
  assert.deepEqual(compaction.promoted_memories[0].tags, ["long_term_fact", "memory_curator", "pricing", "varna"]);
  assert.equal(compaction.archived_sources.length, 2);
  assert.ok(compaction.archived_sources.every((row) => row.tags.includes("compacted_source")));
});

test("role and task compaction require scope_id", () => {
  assert.throws(
    () =>
      buildMemoryCompaction(
        {
          actor_agent: "memory_curator",
          scope: "role",
          source_memory_ids: [1],
          summary: "Compacted role memory.",
        },
        [{ id: 1, scope: "role", scope_id: "assistant", tags: [] }]
      ),
    /scope_id is required for role\/task compaction/
  );
});

test("compaction rejects non-memory_curator actors", () => {
  assert.throws(
    () =>
      buildMemoryCompaction(
        {
          actor_agent: "assistant",
          scope: "business",
          source_memory_ids: [1],
          summary: "Should fail.",
        },
        [{ id: 1, scope: "business", scope_id: null, tags: [] }]
      ),
    /Only memory_curator can compact memories/
  );
});

test("compaction rejects mixed source scopes", () => {
  assert.throws(
    () =>
      buildMemoryCompaction(
        {
          actor_agent: "memory_curator",
          scope: "business",
          source_memory_ids: [1, 2],
          summary: "Should fail.",
        },
        [
          { id: 1, scope: "business", scope_id: null, tags: [] },
          { id: 2, scope: "owner", scope_id: null, tags: [] },
        ]
      ),
    /source memories must share the requested scope/
  );
});

test("compaction allows promoted_facts as strings", () => {
  const compaction = buildMemoryCompaction(
    {
      actor_agent: "memory_curator",
      scope: "owner",
      source_memory_ids: [5],
      summary: "Owner notes compressed.",
      promoted_facts: ["Founder prefers concise answers."],
    },
    [{ id: 5, scope: "owner", scope_id: null, tags: [] }]
  );

  assert.equal(compaction.promoted_memories.length, 1);
  assert.equal(compaction.promoted_memories[0].fact, "Founder prefers concise answers.");
  assert.deepEqual(compaction.promoted_memories[0].tags, ["long_term_fact", "memory_curator"]);
});
