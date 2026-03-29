"use strict";

const { ROLE_PROFILES } = require("./runtime-profiles");

function normalizeRequiredString(value, fieldName) {
  const normalized = String(value || "").trim();
  if (!normalized) {
    throw new Error(`${fieldName} is required`);
  }
  return normalized;
}

function normalizeOptionalString(value) {
  const normalized = String(value || "").trim();
  return normalized.length > 0 ? normalized : null;
}

function parseLimit(value, fallback = 10, max = 50) {
  const parsed = Number.parseInt(value || "", 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.min(parsed, max);
}

function buildMemoryBundleRequest(input = {}) {
  const roleId = normalizeRequiredString(input.role_id, "role_id");
  const roleProfile = ROLE_PROFILES[roleId];
  if (!roleProfile) {
    throw new Error("Invalid role_id");
  }

  const taskId = normalizeOptionalString(input.task_id);
  const limitPerScope = parseLimit(input.limit_per_scope, 10, 50);
  const includeExpired = input.include_expired === true;

  const bundle = {
    role_id: roleId,
    task_id: taskId,
    limit_per_scope: limitPerScope,
    include_expired: includeExpired,
    scopes: {
      owner: false,
      business: false,
      role: false,
      task: false,
      decisions: false,
    },
  };

  for (const scope of roleProfile.memory_scopes) {
    if (scope === "task" && !taskId) {
      continue;
    }
    bundle.scopes[scope] = true;
  }

  return bundle;
}

module.exports = {
  buildMemoryBundleRequest,
};
