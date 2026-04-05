"use strict";

const { Pool } = require("pg");
const { setTimeout: sleep } = require("node:timers/promises");
const { buildInternalAuthHeaders } = require("../src/control-api-auth");
const { resolveScheduledTelegramTarget } = require("../src/scheduled-telegram-target");
const { buildTelegramTextMessage, callTelegramApi, normalizeTelegramBotConfig } = require("../src/telegram-bot-client");
const { executeRoleRun } = require("../src/executor-client");
const { buildKnowledgeClaimSource, buildKnowledgeDirtyQueueItem } = require("../src/knowledge-service");
const { buildKnowledgeExtractionPlan } = require("../src/knowledge-extractor");
const { buildRunCompletionInput, buildRunExecutionContext, normalizeWorkerRoleIds } = require("../src/run-worker");
const { buildRunLogFields, createStructuredLogger } = require("../src/structured-logging");

const DATABASE_URL = String(process.env.DATABASE_URL || "").trim();
const CONTROL_API_URL = String(process.env.CONTROL_API_URL || "http://127.0.0.1:3000").trim();
const CONTROL_API_INTERNAL_TOKEN = String(process.env.CONTROL_API_INTERNAL_TOKEN || "").trim();
const PGSSLMODE = String(process.env.PGSSLMODE || "").trim();
const WORKER_ROLE_IDS = normalizeWorkerRoleIds(process.env.WORKER_ROLE_IDS);
const WORKER_POLL_INTERVAL_MS = Number.parseInt(process.env.WORKER_POLL_INTERVAL_MS || "3000", 10);
const TELEGRAM_CONFIG = process.env.TELEGRAM_BOT_TOKEN ? normalizeTelegramBotConfig(process.env) : null;
const TELEGRAM_ALLOWED_CHAT_ID = String(process.env.TELEGRAM_ALLOWED_CHAT_ID || "").trim() || null;
const logger = createStructuredLogger({
  service: "role-worker",
  baseFields: {
    pid: process.pid,
  },
});

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
    headers: buildInternalAuthHeaders(CONTROL_API_INTERNAL_TOKEN, {
      "content-type": "application/json",
    }),
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

async function loadTelegramTopicRows(client, chatId) {
  if (!chatId) {
    return [];
  }

  const result = await client.query(
    `
      SELECT thread_id, chat_id, message_thread_id, topic_name, last_founder_message_id, created_at, updated_at
      FROM telegram_threads
      WHERE chat_id = $1
      ORDER BY updated_at DESC, created_at DESC
      LIMIT 100
    `,
    [chatId]
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

async function persistKnowledgeExtraction(result) {
  const extractionPlan = buildKnowledgeExtractionPlan(result);
  if (!extractionPlan) {
    return {
      claim_candidates_created: 0,
      dirty_queue_items_created: 0,
      skipped: true,
    };
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    let claimCandidatesCreated = 0;
    for (const candidate of extractionPlan.claim_candidates) {
      const claimResult = await client.query(
        `
          INSERT INTO knowledge_claims (
            claim_text, claim_type, scope, scope_id, status, confidence, freshness_score
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          RETURNING id
        `,
        [
          candidate.claim_text,
          candidate.claim_type,
          candidate.scope,
          candidate.scope_id,
          candidate.status,
          candidate.confidence,
          candidate.freshness_score,
        ]
      );

      claimCandidatesCreated += 1;
      for (const template of extractionPlan.source_templates) {
        const source = buildKnowledgeClaimSource({
          claim_id: claimResult.rows[0].id,
          source_type: template.source_type,
          source_id: template.source_id,
          support_type: template.support_type,
          evidence_snippet: template.evidence_snippet,
        });

        await client.query(
          `
            INSERT INTO knowledge_claim_sources (
              claim_id, source_type, source_id, support_type, evidence_snippet
            )
            VALUES ($1, $2, $3, $4, $5)
          `,
          [source.claim_id, source.source_type, source.source_id, source.support_type, candidate.claim_text]
        );
      }
    }

    const dirtyQueueItem = buildKnowledgeDirtyQueueItem(extractionPlan.dirty_queue_item);
    await client.query(
      `
        INSERT INTO knowledge_dirty_queue (
          source_type, source_id, affected_scope, affected_scope_id, affected_node_slugs_json, reason, priority, status
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `,
      [
        dirtyQueueItem.source_type,
        dirtyQueueItem.source_id,
        dirtyQueueItem.affected_scope,
        dirtyQueueItem.affected_scope_id,
        JSON.stringify(dirtyQueueItem.affected_node_slugs),
        dirtyQueueItem.reason,
        dirtyQueueItem.priority,
        dirtyQueueItem.status,
      ]
    );

    await client.query("COMMIT");

    return {
      claim_candidates_created: claimCandidatesCreated,
      dirty_queue_items_created: 1,
      skipped: false,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function processOneRun(runRow) {
  const client = await pool.connect();
  let task;
  let messages;
  let telegramThread;
  let telegramTopicRows;

  try {
    [task, messages, telegramThread, telegramTopicRows] = await Promise.all([
      loadTask(client, runRow.task_id),
      loadMessages(client, runRow.thread_id),
      loadTelegramThread(client, runRow.thread_id),
      loadTelegramTopicRows(client, TELEGRAM_ALLOWED_CHAT_ID),
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

    const { completion, reply_text } = buildRunCompletionInput(runRow, executorResponse, executionContext);
    const completeResponse = await callControlApi(`/runs/${runRow.id}/complete`, completion);

    return {
      run: runRow,
      task,
      messages,
      telegram_thread: telegramThread,
      scheduled_telegram_target: resolveScheduledTelegramTarget({
        run: runRow,
        allowed_chat_id: TELEGRAM_ALLOWED_CHAT_ID,
        telegram_topic_rows: telegramTopicRows,
      }),
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
  logger.info("worker_started", {
    control_api_url: CONTROL_API_URL,
    roles: WORKER_ROLE_IDS,
  });

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
      logger.error("run_claim_failed", {
        poll_retry_ms: 5000,
        error,
      });
      await sleep(5000);
      continue;
    }

    if (!claimedRun) {
      await sleep(pollIntervalMs);
      continue;
    }

    logger.info("run_claimed", buildRunLogFields(claimedRun));

    let stage = "execution";
    let deliveryContext = {};
    try {
      const result = await processOneRun(claimedRun);
      logger.info(
        "run_execution_completed",
        buildRunLogFields(claimedRun, {
          model_used: result.completion_response?.run?.model_used || null,
          fallback_chain: result.completion_response?.run?.fallback_chain || [],
          prompt_tokens: result.completion_response?.run?.prompt_tokens ?? null,
          completion_tokens: result.completion_response?.run?.completion_tokens ?? null,
          total_tokens: result.completion_response?.run?.total_tokens ?? null,
          response_cost_usd: result.completion_response?.run?.response_cost_usd ?? null,
          reply_text_present: Boolean(result.reply_text),
          artifact_created: Boolean(result.completion_response?.artifact),
        })
      );
      try {
        const extractionResult = await persistKnowledgeExtraction(result);
        logger.info(
          "knowledge_extraction_completed",
          buildRunLogFields(claimedRun, {
            claim_candidates_created: extractionResult.claim_candidates_created,
            dirty_queue_items_created: extractionResult.dirty_queue_items_created,
            skipped: extractionResult.skipped,
          })
        );
      } catch (error) {
        logger.error(
          "knowledge_extraction_failed",
          buildRunLogFields(claimedRun, {
            error,
          })
        );
      }
      stage = "delivery";
      if (result.reply_text && result.telegram_thread && TELEGRAM_CONFIG) {
        deliveryContext = {
          delivery_mode: "thread_reply",
          chat_id: result.telegram_thread.chat_id,
          message_thread_id: result.telegram_thread.message_thread_id,
        };
        const sendMessagePayload = buildTelegramTextMessage({
          chat_id: result.telegram_thread.chat_id,
          message_thread_id: result.telegram_thread.message_thread_id,
          reply_to_message_id: result.telegram_thread.last_founder_message_id,
          text: result.reply_text,
        });

        await callTelegramApi("sendMessage", sendMessagePayload, {
          config: TELEGRAM_CONFIG,
        });
        logger.info(
          "run_delivery_completed",
          buildRunLogFields(claimedRun, {
            ...deliveryContext,
          })
        );
      } else if (result.reply_text && result.scheduled_telegram_target && TELEGRAM_CONFIG) {
        deliveryContext = {
          delivery_mode: "scheduled_topic_delivery",
          target_mode: result.scheduled_telegram_target.target_mode,
          chat_id: result.scheduled_telegram_target.chat_id,
          message_thread_id: result.scheduled_telegram_target.message_thread_id,
          topic_name: result.scheduled_telegram_target.topic_name,
        };
        const sendMessagePayload = buildTelegramTextMessage({
          chat_id: result.scheduled_telegram_target.chat_id,
          message_thread_id: result.scheduled_telegram_target.message_thread_id,
          text: result.reply_text,
        });

        await callTelegramApi("sendMessage", sendMessagePayload, {
          config: TELEGRAM_CONFIG,
        });
        logger.info(
          "run_delivery_completed",
          buildRunLogFields(claimedRun, {
            ...deliveryContext,
          })
        );
      } else if (result.reply_text) {
        deliveryContext = {
          delivery_mode: "not_delivered",
        };
        logger.info(
          "run_reply_captured",
          buildRunLogFields(claimedRun, {
            ...deliveryContext,
          })
        );
      }
    } catch (error) {
      logger.error(
        stage === "delivery" ? "run_delivery_failed" : "run_execution_failed",
        {
          ...buildRunLogFields(claimedRun),
          stage,
          ...deliveryContext,
          error,
        }
      );
      await sleep(pollIntervalMs);
    }
  }
}

main().catch(async (error) => {
  logger.error("worker_fatal_error", {
    error,
  });
  await pool.end();
  process.exit(1);
});
