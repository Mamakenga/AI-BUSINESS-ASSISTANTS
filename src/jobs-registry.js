"use strict";

const { getJobDispatchStatus } = require("./job-trigger");
const { ROLE_PROFILES } = require("./runtime-profiles");

const REGISTERED_JOBS = Object.freeze([
  {
    job_type: "daily_founder_brief",
    title: "Daily Founder Brief",
    assigned_agent: "assistant",
    schedule: "daily morning",
    output_summary: "Short Telegram digest for the leader.",
    request_text:
      "Prepare the daily brief for the leader in Russian. Do not ask follow-up questions. Use the available context, memory, and recent activity only. If fresh data is limited, say that directly, do not fill gaps with invented business claims, and still produce the best concise brief you can. Keep it executive-friendly, but only state what is actually supported by the available context. Format it as a Telegram-ready update with exactly these sections: 1) Текущий статус, 2) Подтвержденные сигналы и изменения, 3) Срочные открытые вопросы, 4) Главный риск или блокировка, 5) Безопасный следующий шаг.",
  },
  {
    job_type: "weekly_digest",
    title: "Weekly Digest",
    assigned_agent: "assistant",
    schedule: "monday morning",
    output_summary: "Weekly digest for the leader with decisions, risks, and unresolved items.",
    request_text:
      "Prepare the weekly digest for the leader in Russian. Do not ask follow-up questions. Use the available context, memory, tasks, decisions, and recent activity only. If confirmed information is limited, say that directly, do not fill gaps with invented business claims, and still produce the best concise digest you can. Keep it executive-friendly, but only state what is actually supported by the available context. Format it as a Telegram-ready update with exactly these sections: 1) Что изменилось за неделю, 2) Подтвержденные решения или сдвиги, 3) Нерешенные вопросы, 4) Риски или блокировки, 5) Главный фокус на следующую неделю.",
  },
  {
    job_type: "competitor_watch",
    title: "Competitor Watch",
    assigned_agent: "researcher",
    schedule: "daily",
    output_summary: "Daily competitor watch with grounded market signals and escalation notes.",
    request_text:
      "Run the daily competitor watch in Russian. Do not ask follow-up questions. Use only available context, memory, tasks, decisions, and recent activity. If confirmed competitor information is limited, say that directly, do not fill gaps with invented market signals, and still produce the best concise report you can. Format it as a compact update with: 1) confirmed competitor or market signals, 2) why they matter for us, 3) what should be escalated to assistant, methodist, or finance_analyst, 4) one recommended next action.",
  },
  {
    job_type: "branch_finance_review",
    title: "Branch Finance Review",
    assigned_agent: "finance_analyst",
    schedule: "friday evening",
    output_summary: "Branch-level finance review with anomalies, risks, and practical recommendations.",
    request_text:
      "Prepare the branch finance review in Russian. Do not ask follow-up questions. Use only available context, memory, tasks, decisions, and recent activity. If confirmed financial information is limited, say that directly, do not fill gaps with invented financial anomalies, and still produce the best concise review you can. Format it as a compact report with: 1) branch-level anomalies or unusual shifts, 2) risky trends in numbers, 3) what requires escalation to the leader, 4) one practical recommendation or next action.",
  },
  {
    job_type: "weekly_risk_review",
    title: "Weekly Risk Review",
    assigned_agent: "critic",
    schedule: "friday evening after finance review",
    output_summary: "Weekly risk review with contradictions, weak assumptions, and escalation notes.",
    request_text:
      "Prepare the weekly risk review in Russian. Do not ask follow-up questions. Use only available context, memory, tasks, decisions, artifacts, and recent activity. If confirmed evidence is limited, say that directly, do not fill gaps with invented risks or contradictions, and still produce the best concise review you can. Format it as a compact critic report with: 1) contradictions or tension points, 2) weak assumptions or fragile reasoning, 3) what may become risky next, 4) one escalation note or corrective action.",
  },
  {
    job_type: "memory_cleanup",
    title: "Memory Cleanup",
    assigned_agent: "memory_curator",
    schedule: "twice per week",
    output_summary: "Memory cleanup report with compaction, promotion, and noise reduction notes.",
    request_text:
      "Run memory cleanup in Russian. Do not ask follow-up questions. Use only available context, memory, decisions, artifacts, and recent activity. If compactable evidence is limited, say that directly, do not fill gaps with invented memory actions, and still produce the best concise curator report you can. Format it as a compact memory report with: 1) what should be compacted or merged, 2) what should be promoted into durable memory, 3) what looks noisy, duplicated, or stale, 4) one corrective memory action.",
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
    request_text: job.request_text,
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
