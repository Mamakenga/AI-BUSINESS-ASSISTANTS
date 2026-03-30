"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildJobSyncPlan,
  listRegisteredJobs,
  mergeRegisteredJobsWithStoredRows,
} = require("../src/jobs-registry");

test("listRegisteredJobs returns the six planned scheduled jobs", () => {
  const jobs = listRegisteredJobs();

  assert.equal(jobs.length, 6);
  assert.deepEqual(
    jobs.map((job) => job.job_type),
    [
      "daily_founder_brief",
      "weekly_digest",
      "competitor_watch",
      "branch_finance_review",
      "weekly_risk_review",
      "memory_cleanup",
    ]
  );
});

test("daily founder brief request is deterministic and does not ask for clarification", () => {
  const jobs = listRegisteredJobs();
  const dailyBrief = jobs.find((job) => job.job_type === "daily_founder_brief");

  assert.ok(dailyBrief);
  assert.match(dailyBrief.request_text, /Do not ask follow-up questions/i);
  assert.match(dailyBrief.request_text, /leader/i);
  assert.match(dailyBrief.request_text, /If fresh data is limited/i);
});

test("buildJobSyncPlan inserts missing jobs and updates drifted jobs", () => {
  const plan = buildJobSyncPlan([
    {
      id: 11,
      job_type: "daily_founder_brief",
      assigned_agent: "assistant",
      schedule: "daily morning",
    },
    {
      id: 12,
      job_type: "weekly_digest",
      assigned_agent: "assistant",
      schedule: "every friday",
    },
  ]);

  assert.equal(plan.inserts.length, 4);
  assert.equal(plan.updates.length, 1);
  assert.equal(plan.updates[0].job_type, "weekly_digest");
  assert.equal(plan.updates[0].schedule, "monday morning");
  assert.equal(plan.unchanged.length, 1);
  assert.equal(plan.unchanged[0].job_type, "daily_founder_brief");
});

test("buildJobSyncPlan rejects duplicate stored job rows for one job type", () => {
  assert.throws(
    () =>
      buildJobSyncPlan([
        { id: 1, job_type: "daily_founder_brief", assigned_agent: "assistant", schedule: "daily morning" },
        { id: 2, job_type: "daily_founder_brief", assigned_agent: "assistant", schedule: "daily morning" },
      ]),
    /Duplicate stored jobs/
  );
});

test("mergeRegisteredJobsWithStoredRows reports missing and present db rows", () => {
  const items = mergeRegisteredJobsWithStoredRows([
    {
      id: 31,
      job_type: "competitor_watch",
      assigned_agent: "researcher",
      schedule: "daily",
      enabled: false,
      last_run_at: "2026-03-30T10:00:00.000Z",
      next_run_at: "2026-03-31T10:00:00.000Z",
      created_at: "2026-03-30T09:00:00.000Z",
    },
  ]);

  const competitorWatch = items.find((item) => item.job_type === "competitor_watch");
  const dailyFounderBrief = items.find((item) => item.job_type === "daily_founder_brief");

  assert.equal(competitorWatch.registry_status, "registered");
  assert.equal(competitorWatch.enabled, false);
  assert.equal(competitorWatch.id, 31);
  assert.equal(dailyFounderBrief.registry_status, "missing_in_db");
  assert.equal(dailyFounderBrief.id, null);
});

test("mergeRegisteredJobsWithStoredRows surfaces unregistered stored jobs instead of hiding them", () => {
  const items = mergeRegisteredJobsWithStoredRows([
    {
      id: 99,
      job_type: "manual_experiment",
      assigned_agent: "assistant",
      schedule: "manual",
      enabled: true,
      last_run_at: null,
      next_run_at: null,
      created_at: "2026-03-30T09:00:00.000Z",
    },
  ]);

  const manualJob = items.find((item) => item.job_type === "manual_experiment");

  assert.equal(manualJob.registry_status, "unregistered_in_db");
  assert.equal(manualJob.title, null);
  assert.equal(manualJob.output_summary, null);
});
