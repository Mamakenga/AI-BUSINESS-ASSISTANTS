"use strict";

const { ROLE_PROFILES } = require("./runtime-profiles");
const { normalizeLooseOptionalString, normalizeRequiredString } = require("./string-normalizers");

function parseLimit(value, fallback = 10, max = 50) {
  const parsed = Number.parseInt(value || "", 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.min(parsed, max);
}

function createEmptyBundleResult(bundleRequest) {
  return {
    role_id: bundleRequest.role_id,
    task_id: bundleRequest.task_id,
    limit_per_scope: bundleRequest.limit_per_scope,
    max_total_items: bundleRequest.max_total_items,
    include_expired: bundleRequest.include_expired,
    owner: [],
    business: [],
    role: [],
    task: [],
    decisions: {
      owner: [],
      business: [],
      task: [],
    },
  };
}

function buildMemoryBundleRequest(input = {}) {
  const roleId = normalizeRequiredString(input.role_id, "role_id");
  const roleProfile = ROLE_PROFILES[roleId];
  if (!roleProfile) {
    throw new Error("Invalid role_id");
  }

  const taskId = normalizeLooseOptionalString(input.task_id);
  const limitPerScope = parseLimit(input.limit_per_scope, 10, 50);
  const maxTotalItems = parseLimit(input.max_total_items, 24, 100);
  const includeExpired = input.include_expired === true;

  const bundle = {
    role_id: roleId,
    task_id: taskId,
    limit_per_scope: limitPerScope,
    max_total_items: maxTotalItems,
    include_expired: includeExpired,
    scope_order: [],
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
    bundle.scope_order.push(scope);
  }

  return bundle;
}

function trimMemoryBundle(bundle, bundleRequest) {
  let remaining = bundleRequest.max_total_items;
  let includedItems = 0;
  let truncated = false;
  const trimmed = createEmptyBundleResult(bundleRequest);
  const truncatedScopes = [];

  function takeItems(scopeKey, items) {
    if (remaining <= 0) {
      if (items.length > 0) {
        truncated = true;
        truncatedScopes.push(scopeKey);
      }
      return [];
    }

    const taken = items.slice(0, remaining);
    if (taken.length < items.length) {
      truncated = true;
      truncatedScopes.push(scopeKey);
    }
    remaining -= taken.length;
    includedItems += taken.length;
    return taken;
  }

  for (const scope of bundleRequest.scope_order) {
    if (scope === "decisions") {
      trimmed.decisions.owner = takeItems("decisions.owner", bundle.decisions.owner || []);
      trimmed.decisions.business = takeItems("decisions.business", bundle.decisions.business || []);
      trimmed.decisions.task = takeItems("decisions.task", bundle.decisions.task || []);
      continue;
    }

    trimmed[scope] = takeItems(scope, bundle[scope] || []);
  }

  trimmed.meta = {
    scope_order: bundleRequest.scope_order,
    max_total_items: bundleRequest.max_total_items,
    included_items: includedItems,
    truncated,
    truncated_scopes: truncatedScopes,
  };

  return trimmed;
}

module.exports = {
  buildMemoryBundleRequest,
  createEmptyBundleResult,
  trimMemoryBundle,
};
