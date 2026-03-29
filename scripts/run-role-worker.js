"use strict";

const { Pool } = require("pg");
const { setTimeout: sleep } = require("node:timers/promises");
const { executeOpenClawRun } = require("../src/openclaw-client");
const { buildRunCompletionInput, buildRunExecutionContext, normalizeWorkerRoleIds } = require("../src/run-worker");

const DATABASE_URL = String(process.env.DATABASE_URL || "").trim();
const CONTROL_API_URL = String(process.env.CONTROL_API_URL || "http://127.0.0.1:3000").trim();
const PGSSLMODE = String(process.env.PGSSLMODE || "").trim();
const WORKER_ROLE_IDS = normalizeWorkerRoleIds(process.env.WORKER_ROLE_IDS);
const WORKER_POLL_INTERVAL_MS = Number.parseInt(process.env.WORKER_POLL_INTERVAL_MS || "3000", 10);

if (!DATABASE_URL) {
  throw new Error("DATABASE_URL is required");
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: PGSSLMODE === "disable" ? false : { rejectUnauthorized: false },
});

function normalizePollIntervalMs(value) {
  if (!Number.isFinite(value) || value <= 0) {
    return 3000;
  }
  return Math.max(value, 500);
}

async function callControlApi(path, body) {
  const response = await fetch(`${CONTROL_API_URL}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new Error(`Control API ${path} failed: ${response.status} ${text}`);
  }

  return payload;
}

async function claimNextRun(client, roleIds) {
  await client.query("BEGIN");

  try {
    const claimResult = await client.query(
      `
        SELECT id, agent, task_id, thread_id, status, requested_by_agent, dispatch_reason, model_used, fallback_chain, started_at, finished_at, created_at
        FROM runs
        WHERE status = 'pending' AND agent = ANY($1::text[])
        ORDER BY created_at ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      `,
      [roleIds]
    );

    if (claimResult.rowCount === 0) {
      await client.query("COMMIT");
      return null;
    }

    const runRow = claimResult.rows[0];
    const runningResult = await client.query(
      `
        UPDATE runs
        SET status = 'running', started_at = COALESCE(started_at, now())
        WHERE id = $1
        RETURNING id, agent, task_id, thread_id, status, requested_by_agent, dispatch_reason, model_used, fallback_chain, started_at, finished_at, created_at
      `,
      [runRow.id]
    );

    await client.query("COMMIT");
    return runningResult.rows[0];
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

async function loadTask(client, taskId) {
  if (!taskId) {
    return null;
  }

  const result = await client.query(
    `
      SELECT id, title, status, assigned_role, priority, due_at, thread_id, board_order, created_at, updated_at
      FROM tasks
      WHERE id = $1
    `,
    [taskId]
  );

  return result.rows[0] || null;
}

async function loadMessages(client, threadId) {
  if (!threadId) {
    return [];
  }

  const result = await client.query(
    `
      SELECT id, thread_id, task_id, from_agent, to_agent, message_type, content, status, created_at
      FROM messages
      WHERE thread_id = $1
      ORDER BY created_at ASC
      LIMIT 50
    `,
    [threadId]
  );

  return result.rows;
}

async function loadMemoryBundle(runRow) {
  return callControlApi("/memory/bundles/resolve", {
    role_id: runRow.agent,
    task_id: runRow.task_id,
    max_total_items: 12,
  });
}

async function processOneRun(runRow) {
  const client = await pool.connect();
  try {
    const [task, messages, memoryBundle] = await Promise.all([
      loadTask(client, runRow.task_id),
      loadMessages(client, runRow.thread_id),
      loadMemoryBundle(runRow),
    ]);

    const executionContext = buildRunExecutionContext({
      run: runRow,
      task,
      messages,
      memory_bundle: memoryBundle,
    });

    const openClawResponse = await executeOpenClawRun(executionContext, {
      env: process.env,
    });

    const { completion, reply_text } = buildRunCompletionInput(runRow, openClawResponse);
    const completeResponse = await callControlApi(`/runs/${runRow.id}/complete`, completion);

    return {
      run: runRow,
      task,
      messages,
      memory_bundle: memoryBundle,
      openclaw_response: openClawResponse,
      completion_response: completeResponse,
      reply_text,
    };
  } catch (error) {
    await client.query(
      `
        UPDATE runs
        SET status = 'failed', finished_at = now()
        WHERE id = $1 AND status = 'running'
      `,
      [runRow.id]
    );
    throw error;
  } finally {
    client.release();
  }
}

async function main() {
  console.log("[role-worker] starting");
  console.log(`[role-worker] control api: ${CONTROL_API_URL}`);
  console.log(`[role-worker] roles: ${WORKER_ROLE_IDS.join(", ")}`);

  const pollIntervalMs = normalizePollIntervalMs(WORKER_POLL_INTERVAL_MS);

  while (true) {
    const client = await pool.connect();
    let claimedRun = null;
    try {
      claimedRun = await claimNextRun(client, WORKER_ROLE_IDS);
    } finally {
      client.release();
    }

    if (!claimedRun) {
      await sleep(pollIntervalMs);
      continue;
    }

    try {
      const result = await processOneRun(claimedRun);
      console.log(`[role-worker] completed run ${claimedRun.id} for ${claimedRun.agent}`);
      if (result.reply_text) {
        console.log(`[role-worker] reply text captured for run ${claimedRun.id}`);
      }
    } catch (error) {
      console.error(`[role-worker] failed run ${claimedRun.id}`, error);
      await sleep(pollIntervalMs);
    }
  }
}

main().catch(async (error) => {
  console.error("[role-worker] fatal error", error);
  await pool.end();
  process.exit(1);
});
