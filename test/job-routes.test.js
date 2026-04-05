"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { isJobRegistryError, mapJobRow } = require("../src/job-routes");

test("mapJobRow keeps jobs API shape stable", () => {
  const mapped = mapJobRow({
    id: 12,
    job_type: "daily_founder_brief",
    assigned_agent: "assistant",
    schedule: "daily morning",
    enabled: true,
    last_run_at: "2026-04-05T08:00:00.000Z",
    next_run_at: "2026-04-06T08:00:00.000Z",
    created_at: "2026-04-01T08:00:00.000Z",
  });

  assert.deepEqual(mapped, {
    id: 12,
    job_type: "daily_founder_brief",
    assigned_agent: "assistant",
    schedule: "daily morning",
    enabled: true,
    last_run_at: "2026-04-05T08:00:00.000Z",
    next_run_at: "2026-04-06T08:00:00.000Z",
    created_at: "2026-04-01T08:00:00.000Z",
  });
});

test("isJobRegistryError only flags known registry drift messages", () => {
  assert.equal(isJobRegistryError("Duplicate stored jobs for job_type: daily_founder_brief"), true);
  assert.equal(isJobRegistryError("Unknown assigned_agent in job registry: legacy_role"), true);
  assert.equal(isJobRegistryError("Duplicate registered job_type: daily_founder_brief"), true);
  assert.equal(isJobRegistryError("some other error"), false);
  assert.equal(isJobRegistryError(null), false);
});
