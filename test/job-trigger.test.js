"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { buildJobTrigger, getJobDispatchStatus } = require("../src/job-trigger");

test("getJobDispatchStatus marks assistant jobs as worker dispatchable", () => {
  const dispatch = getJobDispatchStatus("assistant");

  assert.equal(dispatch.dispatch_status, "worker_dispatchable");
});

test("getJobDispatchStatus marks memory_curator jobs as service_only", () => {
  const dispatch = getJobDispatchStatus("memory_curator");

  assert.equal(dispatch.dispatch_status, "service_only");
});

test("buildJobTrigger creates a pending scheduler run for dispatchable jobs", () => {
  const trigger = buildJobTrigger(
    {
      thread_id: "thread_jobs_founder",
      next_run_at: "2026-03-31T06:00:00.000Z",
      triggered_at: "2026-03-30T06:00:00.000Z",
    },
    {
      job_type: "daily_founder_brief",
      title: "Daily Founder Brief",
      assigned_agent: "assistant",
    }
  );

  assert.equal(trigger.run.agent, "assistant");
  assert.equal(trigger.run.status, "pending");
  assert.equal(trigger.run.thread_id, "thread_jobs_founder");
  assert.equal(trigger.run.requested_by_agent, "scheduler");
  assert.equal(trigger.job_update.next_run_at, "2026-03-31T06:00:00.000Z");
  assert.equal(trigger.job_update.last_run_at, undefined);
  assert.equal(trigger.trigger.triggered_at, "2026-03-30T06:00:00.000Z");
});

test("buildJobTrigger rejects non-dispatchable jobs", () => {
  assert.throws(
    () =>
      buildJobTrigger(
        {},
        {
          job_type: "memory_cleanup",
          title: "Memory Cleanup",
          assigned_agent: "memory_curator",
        }
      ),
    /not dispatchable/
  );
});
