"use strict";

const { getRegisteredRoleCatalogRow, isWorkerDispatchableRoleId } = require("./role-catalog");
const { normalizeOptionalString, normalizeRequiredString } = require("./string-normalizers");

function normalizeOptionalDate(value, fieldName) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid ${fieldName}`);
  }
  return date.toISOString();
}

function getJobDispatchStatus(assignedAgent) {
  const roleRow = getRegisteredRoleCatalogRow(assignedAgent);
  if (!roleRow) {
    return {
      dispatch_status: "unknown_role",
      dispatch_reason: "Assigned role is not defined in the role catalog.",
    };
  }

  if (isWorkerDispatchableRoleId(assignedAgent)) {
    return {
      dispatch_status: "worker_dispatchable",
      dispatch_reason: "Current VPS worker contour can execute this scheduled job.",
    };
  }

  return {
    dispatch_status: "service_only",
    dispatch_reason: `Role ${assignedAgent} is not dispatchable by the current worker contour.`,
  };
}

function buildJobTrigger(input = {}, registeredJob) {
  const jobType = normalizeRequiredString(registeredJob?.job_type, "job_type");
  const assignedAgent = normalizeRequiredString(registeredJob?.assigned_agent, "assigned_agent");
  const dispatch = getJobDispatchStatus(assignedAgent);

  if (dispatch.dispatch_status !== "worker_dispatchable") {
    throw new Error(`Scheduled job ${jobType} is not dispatchable by the current worker contour`);
  }

  const threadId = normalizeOptionalString(input.thread_id);
  const dispatchReason =
    normalizeOptionalString(input.dispatch_reason) ||
    normalizeOptionalString(registeredJob?.request_text) ||
    `Scheduled job trigger: ${registeredJob.title || jobType}`;
  const requestedByAgent = normalizeOptionalString(input.requested_by_agent) || "scheduler";
  const nextRunAt = normalizeOptionalDate(input.next_run_at, "next_run_at");
  const triggeredAt = normalizeOptionalDate(input.triggered_at, "triggered_at");

  return {
    run: {
      agent: assignedAgent,
      task_id: null,
      thread_id: threadId,
      status: "pending",
      requested_by_agent: requestedByAgent,
      dispatch_reason: dispatchReason,
    },
    job_update: {
      next_run_at: nextRunAt,
    },
    trigger: {
      job_type: jobType,
      requested_by_agent: requestedByAgent,
      dispatch_reason: dispatchReason,
      thread_id: threadId,
      triggered_at: triggeredAt || new Date().toISOString(),
    },
  };
}

module.exports = {
  buildJobTrigger,
  getJobDispatchStatus,
};
