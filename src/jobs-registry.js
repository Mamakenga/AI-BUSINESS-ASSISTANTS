"use strict";

const { getJobDispatchStatus } = require("./job-trigger");
const { ROLE_PROFILES } = require("./runtime-profiles");

const REGISTERED_JOBS = Object.freeze([
  {
    job_type: "daily_founder_brief",
    title: "Daily Founder Brief",
    assigned_agent: "assistant",
    schedule: "daily morning",
    output_summary: "Short Telegram digest for the founder.",
  },
  {
    job_type: "weekly_digest",
    title: "Weekly Digest",
    assigned_agent: "assistant",
    schedule: "monday morning",
    output_summary: "Decisions, risks, and unresolved items.",
  },
  {
    job_type: "competitor_watch",
    title: "Competitor Watch",
    assigned_agent: "researcher",
    schedule: "daily",
    output_summary: "Market changes, memory updates, and relevant cross-role messages.",
  },
  {
    job_type: "branch_finance_review",
    title: "Branch Finance Review",
    assigned_agent: "finance_analyst",
    schedule: "friday evening",
    output_summary: "Branch-level anomalies, risky trends, and founder-facing questions.",
  },
  {
    job_type: "weekly_risk_review",
    title: "Weekly Risk Review",
    assigned_agent: "critic",
    schedule: "friday evening after finance review",
    output_summary: "Contradictions, weak assumptions, and escalation notes.",
  },
  {
    job_type: "memory_cleanup",
    title: "Memory Cleanup",
    assigned_agent: "memory_curator",
    schedule: "twice per week",
    output_summary: "Compacted memory and promoted long-term facts.",
  },
]);

function cloneRegisteredJob(job) {
  const dispatch = getJobDispatchStatus(job.assigned_agent);
  return {
    job_type: job.job_type,
    title: job.title,
    assigned_agent: job.assigned_agent,
    schedule: job.schedule,
    output_summary: job.output_summary,
    dispatch_status: dispatch.dispatch_status,
    dispatch_reason: dispatch.dispatch_reason,
  };
}

function listRegisteredJobs() {
  return REGISTERED_JOBS.map(cloneRegisteredJob);
}

function getRegisteredJobMap() {
  return new Map(listRegisteredJobs().map((job) => [job.job_type, job]));
}

function validateRegisteredJobs() {
  const seen = new Set();

  for (const job of REGISTERED_JOBS) {
    if (seen.has(job.job_type)) {
      throw new Error(`Duplicate registered job_type: ${job.job_type}`);
    }
    seen.add(job.job_type);

    if (!ROLE_PROFILES[job.assigned_agent]) {
      throw new Error(`Unknown assigned_agent in job registry: ${job.assigned_agent}`);
    }
  }
}

function mapStoredJobsByType(rows) {
  const byType = new Map();
  for (const row of rows || []) {
    const key = String(row.job_type);
    const existing = byType.get(key) || [];
    existing.push(row);
    byType.set(key, existing);
  }
  return byType;
}

function buildJobSyncPlan(existingRows = []) {
  validateRegisteredJobs();

  const byType = mapStoredJobsByType(existingRows);
  const inserts = [];
  const updates = [];
  const unchanged = [];

  for (const registeredJob of REGISTERED_JOBS) {
    const stored = byType.get(registeredJob.job_type) || [];

    if (stored.length > 1) {
      throw new Error(`Duplicate stored jobs for job_type: ${registeredJob.job_type}`);
    }

    if (stored.length === 0) {
      inserts.push({
        job_type: registeredJob.job_type,
        assigned_agent: registeredJob.assigned_agent,
        schedule: registeredJob.schedule,
        enabled: true,
      });
      continue;
    }

    const current = stored[0];
    const needsUpdate =
      current.assigned_agent !== registeredJob.assigned_agent || current.schedule !== registeredJob.schedule;

    if (needsUpdate) {
      updates.push({
        id: current.id,
        job_type: registeredJob.job_type,
        assigned_agent: registeredJob.assigned_agent,
        schedule: registeredJob.schedule,
      });
      continue;
    }

    unchanged.push({
      id: current.id,
      job_type: current.job_type,
    });
  }

  return {
    inserts,
    updates,
    unchanged,
  };
}

function mergeRegisteredJobsWithStoredRows(existingRows = []) {
  validateRegisteredJobs();

  const byType = mapStoredJobsByType(existingRows);
  const items = [];
  const registeredJobTypes = new Set(REGISTERED_JOBS.map((job) => job.job_type));

  for (const registeredJob of REGISTERED_JOBS) {
    const stored = byType.get(registeredJob.job_type) || [];

    if (stored.length > 1) {
      throw new Error(`Duplicate stored jobs for job_type: ${registeredJob.job_type}`);
    }

    const current = stored[0] || null;

    items.push({
      ...cloneRegisteredJob(registeredJob),
      id: current?.id ?? null,
      enabled: current?.enabled ?? true,
      last_run_at: current?.last_run_at ?? null,
      next_run_at: current?.next_run_at ?? null,
      created_at: current?.created_at ?? null,
      registry_status: current ? "registered" : "missing_in_db",
    });
  }

  for (const storedRow of existingRows) {
    if (registeredJobTypes.has(storedRow.job_type)) {
      continue;
    }

    items.push({
      id: storedRow.id,
      job_type: storedRow.job_type,
      title: null,
      assigned_agent: storedRow.assigned_agent,
      schedule: storedRow.schedule,
      output_summary: null,
      dispatch_status: "unknown_registration",
      dispatch_reason: "Stored job exists in DB but is not part of the registered jobs catalog.",
      enabled: storedRow.enabled,
      last_run_at: storedRow.last_run_at,
      next_run_at: storedRow.next_run_at,
      created_at: storedRow.created_at,
      registry_status: "unregistered_in_db",
    });
  }

  return items;
}

module.exports = {
  buildJobSyncPlan,
  getRegisteredJobMap,
  listRegisteredJobs,
  mergeRegisteredJobsWithStoredRows,
  REGISTERED_JOBS,
};
