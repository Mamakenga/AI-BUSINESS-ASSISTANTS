"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  getRegisteredRoleCatalogRow,
  hasRegisteredRoleId,
  isTaskAssignableRoleId,
  isWorkerDispatchableRoleId,
  listRegisteredRoleCatalog,
  syncRoleCatalog,
} = require("../src/role-catalog");

test("listRegisteredRoleCatalog derives canonical DB rows from runtime profiles", () => {
  const roles = listRegisteredRoleCatalog();

  assert.equal(roles.length, 7);
  assert.deepEqual(
    roles.map((role) => role.role_id),
    ["orchestrator", "assistant", "researcher", "methodist", "finance_analyst", "critic", "memory_curator"]
  );
});

test("role catalog helpers expose task-assignable and founder-visible metadata", () => {
  assert.equal(hasRegisteredRoleId("assistant"), true);
  assert.equal(hasRegisteredRoleId("unknown_role"), false);
  assert.equal(isWorkerDispatchableRoleId("orchestrator"), true);
  assert.equal(isTaskAssignableRoleId("memory_curator"), true);
  assert.equal(isTaskAssignableRoleId("unknown_role"), false);
  assert.equal(isWorkerDispatchableRoleId("assistant"), true);
  assert.equal(isWorkerDispatchableRoleId("memory_curator"), false);
  assert.equal(getRegisteredRoleCatalogRow("memory_curator").dispatchable, false);
  assert.equal(getRegisteredRoleCatalogRow("memory_curator").founder_visible, false);
});

test("syncRoleCatalog no-ops when the table is absent", async () => {
  const queries = [];
  const client = {
    async query(sql) {
      queries.push(sql);
      return { rows: [{ role_catalog: null }] };
    },
  };

  const result = await syncRoleCatalog(client);

  assert.deepEqual(result, { skipped: true, synced: 0, stale_deleted: 0 });
  assert.equal(queries.length, 1);
});

test("syncRoleCatalog upserts canonical roles when the table exists", async () => {
  const calls = [];
  const client = {
    async query(sql, values) {
      calls.push({ sql, values });
      if (calls.length === 1) {
        return { rows: [{ role_catalog: "role_catalog" }] };
      }
      if (calls.length === 2) {
        return { rowCount: 7 };
      }
      if (calls.length === 3) {
        return { rowCount: 0, rows: [] };
      }
      return { rowCount: 2 };
    },
  };

  const result = await syncRoleCatalog(client);

  assert.deepEqual(result, { skipped: false, synced: 7, stale_deleted: 2 });
  assert.equal(calls.length, 4);
  assert.match(calls[1].sql, /INSERT INTO role_catalog/i);
  assert.match(calls[2].sql, /WITH stale_roles AS/i);
  assert.match(calls[3].sql, /DELETE FROM role_catalog/i);

  const payload = JSON.parse(calls[1].values[0]);
  assert.equal(payload.length, 7);
  assert.deepEqual(payload.find((row) => row.role_id === "assistant"), {
    role_id: "assistant",
    founder_entry_mode: "service_only",
    execution_mode: "single_role_worker",
    task_assignable: true,
    dispatchable: true,
    founder_visible: false,
    telegram_topic: null,
  });
  assert.deepEqual(payload.find((row) => row.role_id === "orchestrator"), {
    role_id: "orchestrator",
    founder_entry_mode: "direct_or_topic",
    execution_mode: "multi_role_router",
    task_assignable: true,
    dispatchable: true,
    founder_visible: true,
    telegram_topic: "01 Orchestrator",
  });
});

test("syncRoleCatalog fails when stale DB roles are still referenced", async () => {
  const client = {
    async query(sql) {
      if (/to_regclass/i.test(sql)) {
        return { rows: [{ role_catalog: "role_catalog" }] };
      }
      if (/INSERT INTO role_catalog/i.test(sql)) {
        return { rowCount: 7 };
      }
      if (/WITH stale_roles AS/i.test(sql)) {
        return {
          rowCount: 1,
          rows: [{ role_id: "legacy_analyst", reference_sources: ["runs.agent", "jobs.assigned_agent"] }],
        };
      }
      throw new Error("Unexpected query");
    },
  };

  await assert.rejects(
    () => syncRoleCatalog(client),
    /Stale role_catalog rows are still referenced: legacy_analyst -> runs\.agent, jobs\.assigned_agent/
  );
});
