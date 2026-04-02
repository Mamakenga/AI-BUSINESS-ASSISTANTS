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

test("weekly digest request is deterministic and leader-facing", () => {
  const jobs = listRegisteredJobs();
  const weeklyDigest = jobs.find((job) => job.job_type === "weekly_digest");

  assert.ok(weeklyDigest);
  assert.equal(weeklyDigest.assigned_agent, "assistant");
  assert.match(weeklyDigest.output_summary, /leader/i);
  assert.match(weeklyDigest.request_text, /Do not ask follow-up questions/i);
  assert.match(weeklyDigest.request_text, /If confirmed information is limited/i);
  assert.match(weeklyDigest.request_text, /focus for next week/i);
});

test("competitor watch request is deterministic and escalation-oriented", () => {
  const jobs = listRegisteredJobs();
  const competitorWatch = jobs.find((job) => job.job_type === "competitor_watch");

  assert.ok(competitorWatch);
  assert.equal(competitorWatch.assigned_agent, "researcher");
  assert.match(competitorWatch.output_summary, /grounded market signals/i);
  assert.match(competitorWatch.request_text, /Do not ask follow-up questions/i);
  assert.match(competitorWatch.request_text, /If confirmed competitor information is limited/i);
  assert.match(competitorWatch.request_text, /assistant, methodist, or finance_analyst/i);
  assert.match(competitorWatch.request_text, /one recommended next action/i);
});

test("branch finance review request is deterministic and finance-oriented", () => {
  const jobs = listRegisteredJobs();
  const branchFinanceReview = jobs.find((job) => job.job_type === "branch_finance_review");

  assert.ok(branchFinanceReview);
  assert.equal(branchFinanceReview.assigned_agent, "finance_analyst");
  assert.match(branchFinanceReview.output_summary, /anomalies, risks, and practical recommendations/i);
  assert.match(branchFinanceReview.request_text, /Do not ask follow-up questions/i);
  assert.match(branchFinanceReview.request_text, /If confirmed financial information is limited/i);
  assert.match(branchFinanceReview.request_text, /branch-level anomalies or unusual shifts/i);
  assert.match(branchFinanceReview.request_text, /what requires escalation to the leader/i);
  assert.match(branchFinanceReview.request_text, /one practical recommendation or next action/i);
});

test("weekly risk review request is deterministic and critic-oriented", () => {
  const jobs = listRegisteredJobs();
  const weeklyRiskReview = jobs.find((job) => job.job_type === "weekly_risk_review");

  assert.ok(weeklyRiskReview);
  assert.equal(weeklyRiskReview.assigned_agent, "critic");
  assert.match(weeklyRiskReview.output_summary, /contradictions, weak assumptions, and escalation notes/i);
  assert.match(weeklyRiskReview.request_text, /Do not ask follow-up questions/i);
  assert.match(weeklyRiskReview.request_text, /If confirmed evidence is limited/i);
  assert.match(weeklyRiskReview.request_text, /contradictions or tension points/i);
  assert.match(weeklyRiskReview.request_text, /weak assumptions or fragile reasoning/i);
  assert.match(weeklyRiskReview.request_text, /what may become risky next/i);
  assert.match(weeklyRiskReview.request_text, /one escalation note or corrective action/i);
});

test("memory cleanup request is deterministic and curator-oriented", () => {
  const jobs = listRegisteredJobs();
  const memoryCleanup = jobs.find((job) => job.job_type === "memory_cleanup");

  assert.ok(memoryCleanup);
  assert.equal(memoryCleanup.assigned_agent, "memory_curator");
  assert.match(memoryCleanup.output_summary, /compaction, promotion, and noise reduction notes/i);
  assert.match(memoryCleanup.request_text, /Do not ask follow-up questions/i);
  assert.match(memoryCleanup.request_text, /If compactable evidence is limited/i);
  assert.match(memoryCleanup.request_text, /what should be compacted or merged/i);
  assert.match(memoryCleanup.request_text, /what should be promoted into durable memory/i);
  assert.match(memoryCleanup.request_text, /what looks noisy, duplicated, or stale/i);
  assert.match(memoryCleanup.request_text, /one corrective memory action/i);
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
