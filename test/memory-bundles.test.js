"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { buildMemoryBundleRequest } = require("../src/memory-bundles");

test("assistant bundle includes owner, business, role, decisions and skips task without task_id", () => {
  const bundle = buildMemoryBundleRequest({
    role_id: "assistant",
  });

  assert.deepEqual(bundle, {
    role_id: "assistant",
    task_id: null,
    limit_per_scope: 10,
    include_expired: false,
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
