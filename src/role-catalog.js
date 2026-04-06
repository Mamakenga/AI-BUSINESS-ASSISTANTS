"use strict";

const { ROLE_IDS, ROLE_PROFILES } = require("./runtime-profiles");

const WORKER_DISPATCHABLE_EXECUTION_MODES = new Set(["single_role_worker", "review_worker", "multi_role_router"]);

function normalizeOptionalString(value) {
  if (value === undefined || value === null) {
    return null;
  }

  const normalized = String(value).trim();
  return normalized.length > 0 ? normalized : null;
}

const REGISTERED_ROLE_CATALOG = Object.freeze(
  ROLE_IDS.map((roleId) => {
    const profile = ROLE_PROFILES[roleId];
    return Object.freeze({
      role_id: profile.id,
      founder_entry_mode: profile.founder_entry_mode,
      execution_mode: profile.execution_mode,
      task_assignable: true,
      dispatchable: WORKER_DISPATCHABLE_EXECUTION_MODES.has(profile.execution_mode),
      founder_visible: profile.founder_entry_mode !== "service_only",
      telegram_topic: profile.telegram_topic || null,
    });
  })
);

const REGISTERED_ROLE_BY_ID = new Map(REGISTERED_ROLE_CATALOG.map((role) => [role.role_id, role]));

function listRegisteredRoleCatalog() {
  return REGISTERED_ROLE_CATALOG.map((role) => ({ ...role }));
}

function getRegisteredRoleCatalogRow(roleId) {
  const normalized = normalizeOptionalString(roleId);
  if (!normalized) {
    return null;
  }
  return REGISTERED_ROLE_BY_ID.get(normalized) || null;
}

function hasRegisteredRoleId(roleId) {
  return Boolean(getRegisteredRoleCatalogRow(roleId));
}

function isTaskAssignableRoleId(roleId) {
  return Boolean(getRegisteredRoleCatalogRow(roleId)?.task_assignable);
}

function isWorkerDispatchableRoleId(roleId) {
  return Boolean(getRegisteredRoleCatalogRow(roleId)?.dispatchable);
}

async function syncRoleCatalog(client) {
  const tableResult = await client.query("SELECT to_regclass('public.role_catalog') AS role_catalog");
  if (!tableResult.rows[0]?.role_catalog) {
    return { skipped: true, synced: 0, stale_deleted: 0 };
  }

  const rows = listRegisteredRoleCatalog();
  const roleIds = rows.map((row) => row.role_id);
  await client.query(
    `
      INSERT INTO role_catalog (
        role_id,
        founder_entry_mode,
        execution_mode,
        task_assignable,
        dispatchable,
        founder_visible,
        telegram_topic
      )
      SELECT
        row.role_id,
        row.founder_entry_mode,
        row.execution_mode,
        row.task_assignable,
        row.dispatchable,
        row.founder_visible,
        row.telegram_topic
      FROM jsonb_to_recordset($1::jsonb) AS row(
        role_id TEXT,
        founder_entry_mode TEXT,
        execution_mode TEXT,
        task_assignable BOOLEAN,
        dispatchable BOOLEAN,
        founder_visible BOOLEAN,
        telegram_topic TEXT
      )
      ON CONFLICT (role_id) DO UPDATE
      SET
        founder_entry_mode = EXCLUDED.founder_entry_mode,
        execution_mode = EXCLUDED.execution_mode,
        task_assignable = EXCLUDED.task_assignable,
        dispatchable = EXCLUDED.dispatchable,
        founder_visible = EXCLUDED.founder_visible,
        telegram_topic = EXCLUDED.telegram_topic,
        updated_at = now()
    `,
    [JSON.stringify(rows)]
  );

  const staleReferenceResult = await client.query(
    `
      WITH stale_roles AS (
        SELECT role_id
        FROM role_catalog
        WHERE NOT (role_id = ANY($1::text[]))
      ),
      role_references AS (
        SELECT assigned_role AS role_id, 'tasks.assigned_role' AS reference_source
        FROM tasks
        WHERE assigned_role IS NOT NULL
        UNION ALL
        SELECT assigned_agent AS role_id, 'jobs.assigned_agent' AS reference_source
        FROM jobs
        UNION ALL
        SELECT agent AS role_id, 'runs.agent' AS reference_source
        FROM runs
      )
      SELECT stale_roles.role_id, array_agg(DISTINCT role_references.reference_source ORDER BY role_references.reference_source) AS reference_sources
      FROM stale_roles
      JOIN role_references ON role_references.role_id = stale_roles.role_id
      GROUP BY stale_roles.role_id
      ORDER BY stale_roles.role_id ASC
    `,
    [roleIds]
  );

  if (staleReferenceResult.rowCount > 0) {
    const details = staleReferenceResult.rows
      .map((row) => `${row.role_id} -> ${(row.reference_sources || []).join(", ")}`)
      .join("; ");
    throw new Error(`Stale role_catalog rows are still referenced: ${details}`);
  }

  const deleteResult = await client.query(
    `
      DELETE FROM role_catalog
      WHERE NOT (role_id = ANY($1::text[]))
    `,
    [roleIds]
  );

  return {
    skipped: false,
    synced: rows.length,
    stale_deleted: deleteResult.rowCount || 0,
  };
}

module.exports = {
  getRegisteredRoleCatalogRow,
  hasRegisteredRoleId,
  isTaskAssignableRoleId,
  isWorkerDispatchableRoleId,
  listRegisteredRoleCatalog,
  syncRoleCatalog,
};
