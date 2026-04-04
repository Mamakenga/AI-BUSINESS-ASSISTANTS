"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { buildRunsListQuery } = require("../src/run-list-query");

test("buildRunsListQuery adds fallback filters for ops-debug", () => {
  const result = buildRunsListQuery({
    status: "completed",
    agent: "assistant",
    requested_by_agent: "scheduler",
    fallback_only: "true",
    fallback_marker: "scheduled_empty_context_guard",
    limit: "25",
  });

  assert.match(result.sql, /status = \$1/);
  assert.match(result.sql, /agent = \$2/);
  assert.match(result.sql, /requested_by_agent = \$3/);
  assert.match(result.sql, /jsonb_array_length\(COALESCE\(fallback_chain, '\[\]'::jsonb\)\) > 0/);
  assert.match(result.sql, /COALESCE\(fallback_chain, '\[\]'::jsonb\) \? \$4/);
  assert.deepEqual(result.values, ["completed", "assistant", "scheduler", "scheduled_empty_context_guard", 25]);
  assert.deepEqual(result.filters, {
    status: "completed",
    agent: "assistant",
    requested_by_agent: "scheduler",
    fallback_only: true,
    fallback_marker: "scheduled_empty_context_guard",
    limit: 25,
  });
});

test("buildRunsListQuery defaults to broad recent runs view", () => {
  const result = buildRunsListQuery({});

  assert.doesNotMatch(result.sql, /WHERE/);
  assert.deepEqual(result.values, [50]);
  assert.deepEqual(result.filters, {
    status: null,
    agent: null,
    requested_by_agent: null,
    fallback_only: false,
    fallback_marker: null,
    limit: 50,
  });
});

test("buildRunsListQuery rejects invalid run status", () => {
  assert.throws(() => buildRunsListQuery({ status: "done" }), /Invalid run status/);
});
