"use strict";

const { Pool } = require("pg");
const { setTimeout: sleep } = require("node:timers/promises");
const { buildTelegramTextMessage, callTelegramApi, normalizeTelegramBotConfig } = require("../src/telegram-bot-client");
const { executeRoleRun } = require("../src/executor-client");
const { buildRunCompletionInput, buildRunExecutionContext, normalizeWorkerRoleIds } = require("../src/run-worker");

const DATABASE_URL = String(process.env.DATABASE_URL || "").trim();
const CONTROL_API_URL = String(process.env.CONTROL_API_URL || "http://127.0.0.1:3000").trim();
const PGSSLMODE = String(process.env.PGSSLMODE || "").trim();
const WORKER_ROLE_IDS = normalizeWorkerRoleIds(process.env.WORKER_ROLE_IDS);
const WORKER_POLL_INTERVAL_MS = Number.parseInt(process.env.WORKER_POLL_INTERVAL_MS || "3000", 10);
const TELEGRAM_CONFIG = process.env.TELEGRAM_BOT_TOKEN ? normalizeTelegramBotConfig(process.env) : null;

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

async function loadTelegramThread(client, threadId) {
  if (!threadId) {
    return null;
  }

  const result = await client.query(
    `
      SELECT thread_id, chat_id, message_thread_id, topic_name, last_founder_message_id, created_at, updated_at
      FROM telegram_threads
      WHERE thread_id = $1
    `,
    [threadId]
  );

  return result.rows[0] || null;
}

async function loadMemoryBundle(runRow) {
  return callControlApi("/memory/bundles/resolve", {
    role_id: runRow.agent,
    task_id: runRow.task_id,
    max_total_items: 12,
  });
}

async function failRun(runId) {
  const client = await pool.connect();
  try {
    await client.query(
      `
        UPDATE runs
        SET status = 'failed', finished_at = now()
        WHERE id = $1 AND status = 'running'
      `,
      [runId]
    );
  } finally {
    client.release();
  }
}

async function processOneRun(runRow) {
  const client = await pool.connect();
  let task;
  let messages;
  let telegramThread;

  try {
    [task, messages, telegramThread] = await Promise.all([
      loadTask(client, runRow.task_id),
      loadMessages(client, runRow.thread_id),
      loadTelegramThread(client, runRow.thread_id),
    ]);
  } finally {
    client.release();
  }

  try {
    const memoryBundle = await loadMemoryBundle(runRow);

    const executionContext = buildRunExecutionContext({
      run: runRow,
      task,
      messages,
      memory_bundle: memoryBundle,
    });

    const executorResponse = await executeRoleRun(executionContext, {
      env: process.env,
    });

    const { completion, reply_text } = buildRunCompletionInput(runRow, executorResponse);
    const completeResponse = await callControlApi(`/runs/${runRow.id}/complete`, completion);

    return {
      run: runRow,
      task,
      messages,
      telegram_thread: telegramThread,
      memory_bundle: memoryBundle,
      executor_response: executorResponse,
      completion_response: completeResponse,
      reply_text,
    };
  } catch (error) {
    await failRun(runRow.id);
    throw error;
  }
}

async function main() {
  console.log("[role-worker] starting");
  console.log(`[role-worker] control api: ${CONTROL_API_URL}`);
  console.log(`[role-worker] roles: ${WORKER_ROLE_IDS.join(", ")}`);

  const pollIntervalMs = normalizePollIntervalMs(WORKER_POLL_INTERVAL_MS);

  while (true) {
    let claimedRun = null;
    try {
      const client = await pool.connect();
      try {
        claimedRun = await claimNextRun(client, WORKER_ROLE_IDS);
      } finally {
        client.release();
      }
    } catch (error) {
      console.error("[role-worker] claim error, retrying in 5s", error);
      await sleep(5000);
      continue;
    }

    if (!claimedRun) {
      await sleep(pollIntervalMs);
      continue;
    }

    try {
      const result = await processOneRun(claimedRun);
      console.log(`[role-worker] completed run ${claimedRun.id} for ${claimedRun.agent}`);
      if (result.reply_text && result.telegram_thread && TELEGRAM_CONFIG) {
        const sendMessagePayload = buildTelegramTextMessage({
          chat_id: result.telegram_thread.chat_id,
          message_thread_id: result.telegram_thread.message_thread_id,
          reply_to_message_id: result.telegram_thread.last_founder_message_id,
          text: result.reply_text,
        });

        await callTelegramApi("sendMessage", sendMessagePayload, {
          config: TELEGRAM_CONFIG,
        });
        console.log(`[role-worker] delivered telegram reply for run ${claimedRun.id}`);
      } else if (result.reply_text) {
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
