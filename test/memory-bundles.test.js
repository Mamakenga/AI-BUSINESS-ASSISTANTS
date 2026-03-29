"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { buildMemoryBundleRequest, trimMemoryBundle } = require("../src/memory-bundles");

test("assistant bundle includes owner, business, role, decisions and skips task without task_id", () => {
  const bundle = buildMemoryBundleRequest({
    role_id: "assistant",
  });

  assert.deepEqual(bundle, {
    role_id: "assistant",
    task_id: null,
    limit_per_scope: 10,
    max_total_items: 24,
    include_expired: false,
    scope_order: ["owner", "business", "role", "decisions"],
    scopes: {
      owner: true,
      business: true,
      role: true,
      task: false,
      decisions: true,
    },
  });
});

test("critic bundle with task includes task context and decisions", () => {
  const bundle = buildMemoryBundleRequest({
    role_id: "critic",
    task_id: "task_123",
    limit_per_scope: 7,
  });

  assert.equal(bundle.role_id, "critic");
  assert.equal(bundle.task_id, "task_123");
  assert.equal(bundle.limit_per_scope, 7);
  assert.deepEqual(bundle.scopes, {
    owner: true,
    business: true,
    role: false,
    task: true,
    decisions: true,
  });
});

test("researcher bundle does not pull decisions by default", () => {
  const bundle = buildMemoryBundleRequest({
    role_id: "researcher",
    task_id: "task_456",
  });

  assert.deepEqual(bundle.scopes, {
    owner: true,
    business: true,
    role: true,
    task: true,
    decisions: false,
  });
});

test("bundle request rejects unknown role", () => {
  assert.throws(
    () =>
      buildMemoryBundleRequest({
        role_id: "unknown_role",
      }),
    /Invalid role_id/
  );
});

test("bundle request supports a max_total_items cap", () => {
  const bundle = buildMemoryBundleRequest({
    role_id: "assistant",
    task_id: "task_123",
    max_total_items: 5,
  });

  assert.equal(bundle.max_total_items, 5);
  assert.deepEqual(bundle.scope_order, ["owner", "business", "role", "task", "decisions"]);
});

test("trimMemoryBundle limits the total amount of injected context", () => {
  const bundleRequest = buildMemoryBundleRequest({
    role_id: "assistant",
    task_id: "task_123",
    max_total_items: 4,
  });

  const trimmed = trimMemoryBundle(
    {
      role_id: "assistant",
      task_id: "task_123",
      limit_per_scope: 10,
      max_total_items: 4,
      include_expired: false,
      owner: [{ id: 1 }, { id: 2 }],
      business: [{ id: 3 }, { id: 4 }],
      role: [{ id: 5 }],
      task: [{ id: 6 }],
      decisions: {
        owner: [{ id: 7 }],
        business: [{ id: 8 }],
        task: [{ id: 9 }],
      },
    },
    bundleRequest
  );

  assert.deepEqual(trimmed.owner, [{ id: 1 }, { id: 2 }]);
  assert.deepEqual(trimmed.business, [{ id: 3 }, { id: 4 }]);
  assert.deepEqual(trimmed.role, []);
  assert.deepEqual(trimmed.task, []);
  assert.deepEqual(trimmed.decisions.owner, []);
  assert.equal(trimmed.meta.included_items, 4);
  assert.equal(trimmed.meta.truncated, true);
  assert.deepEqual(trimmed.meta.truncated_scopes, ["role", "task", "decisions.owner", "decisions.business", "decisions.task"]);
});
