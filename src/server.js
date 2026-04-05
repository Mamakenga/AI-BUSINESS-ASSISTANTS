"use strict";

const crypto = require("node:crypto");
const express = require("express");
const { Pool } = require("pg");
const {
  authorizeInternalRequest,
  hasConfiguredInternalToken,
  INTERNAL_AUTH_ROUTE_PREFIXES,
} = require("./control-api-auth");
const { isJobRegistryError, registerJobRoutes } = require("./job-routes");
const { buildMemoryBundleRequest, createEmptyBundleResult, trimMemoryBundle } = require("./memory-bundles");
const { buildMemoryCompaction, normalizeSourceMemoryIds } = require("./memory-compaction");
const { buildMemoryCandidate, parseMemoryQuery } = require("./memory-service");
const { mapMessageRow, registerRunRoutes } = require("./run-routes");
const { mapRunRow } = require("./run-row-mapping");
const { buildRunLogFields, createStructuredLogger } = require("./structured-logging");
const { mapTaskRow, registerTaskRoutes } = require("./task-routes");
const { buildTelegramIntakePlan } = require("./telegram-intake");
const { buildTelegramContext, resolveTelegramIntakeContext } = require("./telegram-intake-context");
const { buildTelegramReply } = require("./telegram-reply");
const { resolveTelegramRouting } = require("./telegram-routing");

const PORT = Number.parseInt(process.env.PORT || "3000", 10);
const DATABASE_URL = process.env.DATABASE_URL || "";
const CONTROL_API_INTERNAL_TOKEN = String(process.env.CONTROL_API_INTERNAL_TOKEN || "").trim();
const JOBS_LOCK_KEY = 431021;

if (!DATABASE_URL) {
  throw new Error("DATABASE_URL is required");
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: process.env.PGSSLMODE === "disable" ? false : { rejectUnauthorized: false },
});

function normalizeNullableString(value) {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  const normalized = String(value).trim();
  return normalized.length > 0 ? normalized : null;
}

function requireInternalAuth(req, res) {
  const authResult = authorizeInternalRequest(req.headers, CONTROL_API_INTERNAL_TOKEN);
  if (authResult.ok) {
    return null;
  }

  return res.status(authResult.status).json(authResult.body);
}

function mapMemoryRow(row) {
  return {
    id: row.id,
    scope: row.scope,
    scope_id: row.scope_id,
    fact: row.fact,
    source: row.source,
    confidence: row.confidence,
    tags: row.tags,
    expires_at: row.expires_at,
    created_at: row.created_at,
  };
}

function mapDecisionRow(row) {
  return {
    id: row.id,
    scope: row.scope,
    decision: row.decision,
    reasoning: row.reasoning,
    made_by: row.made_by,
    status: row.status,
    created_at: row.created_at,
  };
}

function mapTelegramThreadRow(row) {
  return {
    thread_id: row.thread_id,
    chat_id: row.chat_id,
    message_thread_id: row.message_thread_id,
    topic_name: row.topic_name,
    last_founder_message_id: row.last_founder_message_id,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function loadPersistedTelegramTopicName(client, telegramContext) {
  if (
    !telegramContext?.chat_id ||
    telegramContext.message_thread_id === null ||
    telegramContext.message_thread_id === undefined ||
    telegramContext.topic_name
  ) {
    return null;
  }

  const result = await client.query(
    `
      SELECT topic_name
      FROM telegram_threads
      WHERE chat_id = $1
        AND message_thread_id = $2
        AND topic_name IS NOT NULL
      ORDER BY updated_at DESC, created_at DESC
      LIMIT 1
    `,
    [telegramContext.chat_id, telegramContext.message_thread_id]
  );

  return normalizeNullableString(result.rows[0]?.topic_name) || null;
}

const app = express();
app.use(express.json({ limit: "1mb" }));
const logger = createStructuredLogger({
  service: "control-api",
  baseFields: {
    pid: process.pid,
  },
});

app.get("/health", async (_req, res, next) => {
  try {
    const result = await pool.query("SELECT now() AS now");
    return res.json({
      ok: true,
      service: "control-api",
      db_time: result.rows[0].now,
    });
  } catch (error) {
    return next(error);
  }
});

app.use(INTERNAL_AUTH_ROUTE_PREFIXES, (req, res, next) => {
  const authFailure = requireInternalAuth(req, res);
  if (authFailure) {
    return authFailure;
  }
  return next();
});

registerJobRoutes(app, {
  jobsLockKey: JOBS_LOCK_KEY,
  logger,
  pool,
});

app.get("/memories", async (req, res, next) => {
  try {
    const query = parseMemoryQuery(req.query || {});
    const values = [query.scope];
    const where = ["scope = $1"];

    if (query.scope_id !== null) {
      values.push(query.scope_id);
      where.push(`scope_id = $${values.length}`);
    } else {
      where.push("scope_id IS NULL");
    }

    if (!query.include_expired) {
      where.push("(expires_at IS NULL OR expires_at > now())");
    }

    values.push(query.limit);

    const result = await pool.query(
      `
        SELECT id, scope, scope_id, fact, source, confidence, tags, expires_at, created_at
        FROM memories
        WHERE ${where.join(" AND ")}
        ORDER BY created_at DESC
        LIMIT $${values.length}
      `,
      values
    );

    return res.json({
      items: result.rows.map(mapMemoryRow),
    });
  } catch (error) {
    return next(error);
  }
});

app.post("/memories/candidates", async (req, res, next) => {
  try {
    const candidate = buildMemoryCandidate(req.body || {});

    const result = await pool.query(
      `
        INSERT INTO memories (
          scope, scope_id, fact, source, confidence, tags, expires_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id, scope, scope_id, fact, source, confidence, tags, expires_at, created_at
      `,
      [
        candidate.scope,
        candidate.scope_id,
        candidate.fact,
        candidate.source,
        candidate.confidence,
        JSON.stringify(candidate.tags),
        candidate.expires_at,
      ]
    );

    return res.status(201).json(mapMemoryRow(result.rows[0]));
  } catch (error) {
    return next(error);
  }
});

app.post("/memories/compactions", async (req, res, next) => {
  const client = await pool.connect();
  try {
    const sourceMemoryIds = normalizeSourceMemoryIds(req.body?.source_memory_ids);
    await client.query("BEGIN");

    const sourceResult = await client.query(
      `
        SELECT id, scope, scope_id, fact, source, confidence, tags, expires_at, created_at
        FROM memories
        WHERE id = ANY($1::bigint[])
        FOR UPDATE
      `,
      [sourceMemoryIds]
    );

    const compaction = buildMemoryCompaction(req.body || {}, sourceResult.rows);

    const archivedSources = [];
    for (const sourceRow of compaction.archived_sources) {
      const archivedResult = await client.query(
        `
          UPDATE memories
          SET
            tags = $2,
            expires_at = $3
          WHERE id = $1
          RETURNING id, scope, scope_id, fact, source, confidence, tags, expires_at, created_at
        `,
        [sourceRow.id, JSON.stringify(sourceRow.tags), sourceRow.expires_at]
      );
      archivedSources.push(mapMemoryRow(archivedResult.rows[0]));
    }

    const summaryResult = await client.query(
      `
        INSERT INTO memories (
          scope, scope_id, fact, source, confidence, tags, expires_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id, scope, scope_id, fact, source, confidence, tags, expires_at, created_at
      `,
      [
        compaction.summary_memory.scope,
        compaction.summary_memory.scope_id,
        compaction.summary_memory.fact,
        compaction.summary_memory.source,
        compaction.summary_memory.confidence,
        JSON.stringify(compaction.summary_memory.tags),
        compaction.summary_memory.expires_at,
      ]
    );

    const promotedMemories = [];
    for (const promotedMemory of compaction.promoted_memories) {
      const promotedResult = await client.query(
        `
          INSERT INTO memories (
            scope, scope_id, fact, source, confidence, tags, expires_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          RETURNING id, scope, scope_id, fact, source, confidence, tags, expires_at, created_at
        `,
        [
          promotedMemory.scope,
          promotedMemory.scope_id,
          promotedMemory.fact,
          promotedMemory.source,
          promotedMemory.confidence,
          JSON.stringify(promotedMemory.tags),
          promotedMemory.expires_at,
        ]
      );
      promotedMemories.push(mapMemoryRow(promotedResult.rows[0]));
    }

    await client.query("COMMIT");

    return res.status(201).json({
      archived_sources: archivedSources,
      promoted_memories: promotedMemories,
      report: {
        ...compaction.report,
        archived_source_ids: archivedSources.map((item) => item.id),
        promoted_memory_ids: promotedMemories.map((item) => item.id),
        summary_memory_id: summaryResult.rows[0].id,
      },
      summary_memory: mapMemoryRow(summaryResult.rows[0]),
    });
  } catch (error) {
    await client.query("ROLLBACK");
    return next(error);
  } finally {
    client.release();
  }
});

app.post("/memory/bundles/resolve", async (req, res, next) => {
  try {
    const bundleRequest = buildMemoryBundleRequest(req.body || {});
    const result = createEmptyBundleResult(bundleRequest);

    async function loadMemories(scope, scopeId) {
      const values = [scope];
      const where = ["scope = $1"];

      if (scopeId === null) {
        where.push("scope_id IS NULL");
      } else {
        values.push(scopeId);
        where.push(`scope_id = $${values.length}`);
      }

      if (!bundleRequest.include_expired) {
        where.push("(expires_at IS NULL OR expires_at > now())");
      }

      values.push(bundleRequest.limit_per_scope);

      const queryResult = await pool.query(
        `
          SELECT id, scope, scope_id, fact, source, confidence, tags, expires_at, created_at
          FROM memories
          WHERE ${where.join(" AND ")}
          ORDER BY created_at DESC
          LIMIT $${values.length}
        `,
        values
      );

      return queryResult.rows.map(mapMemoryRow);
    }

    async function loadDecisions(scope) {
      if (scope === "task") {
        return [];
      }

      const queryResult = await pool.query(
        `
          SELECT id, scope, decision, reasoning, made_by, status, created_at
          FROM decisions
          WHERE scope = $1 AND status = 'active'
          ORDER BY created_at DESC
          LIMIT $2
        `,
        [scope, bundleRequest.limit_per_scope]
      );

      return queryResult.rows.map(mapDecisionRow);
    }

    if (bundleRequest.scopes.owner) {
      result.owner = await loadMemories("owner", null);
    }
    if (bundleRequest.scopes.business) {
      result.business = await loadMemories("business", null);
    }
    if (bundleRequest.scopes.role) {
      result.role = await loadMemories("role", bundleRequest.role_id);
    }
    if (bundleRequest.scopes.task && bundleRequest.task_id) {
      result.task = await loadMemories("task", bundleRequest.task_id);
    }
    if (bundleRequest.scopes.decisions) {
      result.decisions.owner = await loadDecisions("owner");
      result.decisions.business = await loadDecisions("business");
      result.decisions.task = bundleRequest.task_id ? await loadDecisions("task") : [];
    }

    return res.json(trimMemoryBundle(result, bundleRequest));
  } catch (error) {
    return next(error);
  }
});

app.post("/telegram/route-preview", (req, res, next) => {
  try {
    const text = normalizeNullableString(req.body.text);
    const topicName = normalizeNullableString(req.body.topic_name);

    if (!text) {
      return res.status(400).json({ error: "text is required" });
    }

    const result = resolveTelegramRouting({
      text,
      topic_name: topicName,
      is_group_context: req.body.is_group_context !== false,
    });

    return res.json(result);
  } catch (error) {
    return next(error);
  }
});

app.post("/telegram/intake", async (req, res, next) => {
  let client = null;
  let persistedTopicName = null;
  const telegramContextSeed = buildTelegramContext(req.body.telegram);

  const text = normalizeNullableString(req.body.text);
  if (!text) {
    return res.status(400).json({ error: "text is required" });
  }

  const needsPersistedTopicRestore =
    normalizeNullableString(req.body.topic_name) === null &&
    telegramContextSeed?.topic_name === null &&
    telegramContextSeed?.chat_id &&
    telegramContextSeed?.message_thread_id !== null &&
    telegramContextSeed?.message_thread_id !== undefined;

  try {
    if (needsPersistedTopicRestore) {
      client = await pool.connect();
      persistedTopicName = await loadPersistedTelegramTopicName(client, telegramContextSeed);
    }
  } catch (error) {
    if (client) {
      client.release();
    }
    return next(error);
  }

  const intakeContext = resolveTelegramIntakeContext(req.body, persistedTopicName);
  const topicName = intakeContext.topicName;
  const telegramContext = intakeContext.telegramContext;
  const topicRestored = Boolean(persistedTopicName);
  const intakePlan = buildTelegramIntakePlan({
    text,
    topic_name: topicName,
    is_group_context: req.body.is_group_context !== false,
  });
  const reply = buildTelegramReply(intakePlan, {
    topic_name: topicName,
  });

  if (!intakePlan.should_persist) {
    if (client) {
      client.release();
    }
    logger.info("telegram_intake_skipped", {
      thread_id: intakePlan.thread_id,
      topic_name: topicName,
      topic_restored: topicRestored,
      interaction_type: intakePlan.route?.interaction_type || null,
      resolved_role: intakePlan.route?.resolved_role || null,
      needs_clarification: Boolean(intakePlan.route?.needs_clarification),
      chat_id: telegramContext?.chat_id || null,
      message_thread_id: telegramContext?.message_thread_id ?? null,
    });
    return res.status(200).json({
      persisted: false,
      reply,
      ...intakePlan,
    });
  }

  try {
    if (!client) {
      client = await pool.connect();
    }
    await client.query("BEGIN");

    let telegramThreadRow = null;
    if (telegramContext?.chat_id) {
      const telegramThreadResult = await client.query(
        `
          INSERT INTO telegram_threads (
            thread_id, chat_id, message_thread_id, topic_name, last_founder_message_id
          )
          VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (thread_id)
          DO UPDATE SET
            chat_id = EXCLUDED.chat_id,
            message_thread_id = EXCLUDED.message_thread_id,
            topic_name = COALESCE(EXCLUDED.topic_name, telegram_threads.topic_name),
            last_founder_message_id = EXCLUDED.last_founder_message_id,
            updated_at = now()
          RETURNING thread_id, chat_id, message_thread_id, topic_name, last_founder_message_id, created_at, updated_at
        `,
        [
          intakePlan.thread_id,
          telegramContext.chat_id,
          telegramContext.message_thread_id,
          telegramContext.topic_name,
          telegramContext.message_id,
        ]
      );
      telegramThreadRow = mapTelegramThreadRow(telegramThreadResult.rows[0]);
    }

    let taskRow = null;
    if (intakePlan.task) {
      const taskResult = await client.query(
        `
          INSERT INTO tasks (
            id, title, status, assigned_role, priority, due_at, thread_id, board_order
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          RETURNING id, title, status, assigned_role, priority, due_at, thread_id, board_order, created_at, updated_at
        `,
        [
          intakePlan.task.id,
          intakePlan.task.title,
          intakePlan.task.status,
          intakePlan.task.assigned_role,
          intakePlan.task.priority,
          intakePlan.task.due_at,
          intakePlan.task.thread_id,
          intakePlan.task.board_order,
        ]
      );
      taskRow = mapTaskRow(taskResult.rows[0]);
    }

    const messageResult = await client.query(
      `
        INSERT INTO messages (
          thread_id, task_id, from_agent, to_agent, message_type, content, status
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id, thread_id, task_id, from_agent, to_agent, message_type, content, status, created_at
      `,
      [
        intakePlan.founder_message.thread_id,
        intakePlan.founder_message.task_id,
        intakePlan.founder_message.from_agent,
        intakePlan.founder_message.to_agent,
        intakePlan.founder_message.message_type,
        intakePlan.founder_message.content,
        intakePlan.founder_message.status,
      ]
    );

    const runResult = await client.query(
      `
        INSERT INTO runs (
          agent, task_id, thread_id, status, requested_by_agent, dispatch_reason
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id, agent, task_id, thread_id, status, requested_by_agent, dispatch_reason, model_used, fallback_chain, usage_json, prompt_tokens, completion_tokens, total_tokens, response_cost_usd, started_at, finished_at, created_at
      `,
      [
        intakePlan.run.agent,
        intakePlan.run.task_id,
        intakePlan.run.thread_id,
        intakePlan.run.status,
        "founder",
        null,
      ]
    );

    await client.query("COMMIT");

    const mappedRun = mapRunRow(runResult.rows[0]);
    logger.info(
      "telegram_intake_persisted",
      buildRunLogFields(mappedRun, {
        topic_name: topicName,
        topic_restored: topicRestored,
        interaction_type: intakePlan.route?.interaction_type || null,
        resolved_role: intakePlan.route?.resolved_role || null,
        chat_id: telegramContext?.chat_id || null,
        message_thread_id: telegramContext?.message_thread_id ?? null,
      })
    );

    return res.status(201).json({
      persisted: true,
      reply,
      route: intakePlan.route,
      thread_id: intakePlan.thread_id,
      telegram_thread: telegramThreadRow,
      task: taskRow,
      founder_message: mapMessageRow(messageResult.rows[0]),
      run: mappedRun,
    });
  } catch (error) {
    await client.query("ROLLBACK");
    return next(error);
  } finally {
    client.release();
  }
});

registerRunRoutes(app, {
  logger,
  pool,
});

registerTaskRoutes(app, {
  pool,
  createTaskId: () => `task_${crypto.randomUUID()}`,
});

app.use((error, _req, res, _next) => {
  if (error.message && error.message.startsWith("Invalid")) {
    return res.status(400).json({ error: error.message });
  }

  if (error.message === "fallback_chain must be an array") {
    return res.status(400).json({ error: error.message });
  }

  if (
    error.message === "usage_json must be an object" ||
    error.message === "prompt_tokens must be a non-negative integer" ||
    error.message === "completion_tokens must be a non-negative integer" ||
    error.message === "total_tokens must be a non-negative integer" ||
    error.message === "response_cost_usd must be a non-negative number"
  ) {
    return res.status(400).json({ error: error.message });
  }

  if (error.message === "artifact_content must be an object") {
    return res.status(400).json({ error: error.message });
  }

  if (error.message === "artifact_content is required for task-bound completed runs") {
    return res.status(400).json({ error: error.message });
  }

  if (error.message === "Only the assigned role can complete this run") {
    return res.status(400).json({ error: error.message });
  }

  if (error.message === "Run already in terminal state") {
    return res.status(409).json({ error: error.message });
  }

  if (error.message === "Registered job not found") {
    return res.status(404).json({ error: error.message });
  }

  if (error.message === "Unauthorized internal request") {
    return res.status(401).json({ error: error.message });
  }

  if (error.message === "CONTROL_API_INTERNAL_TOKEN is not configured") {
    return res.status(503).json({ error: error.message });
  }

  if (error.message === "Job is disabled") {
    return res.status(409).json({ error: error.message });
  }

  if (error.message && error.message.endsWith("is required")) {
    return res.status(400).json({ error: error.message });
  }

  if (error.message === "Only orchestrator can create follow-up runs") {
    return res.status(400).json({ error: error.message });
  }

  if (error.message === "title is required") {
    return res.status(400).json({ error: error.message });
  }

  if (
    isJobRegistryError(error.message) ||
    error.message === "Invalid next_run_at" ||
    (typeof error.message === "string" && error.message.startsWith("Scheduled job ") && error.message.endsWith(" is not dispatchable by the current worker contour")) ||
    error.message === "Only memory_curator can compact memories" ||
    error.message === "source_memory_ids must be a non-empty array" ||
    error.message === "source_memory_ids must contain positive integers" ||
    error.message === "source_memory_ids do not match existing memories" ||
    error.message === "source memory already compacted" ||
    error.message === "source memories must share the requested scope" ||
    error.message === "source memories must share the requested scope_id" ||
    error.message === "scope_id is required for role/task compaction" ||
    error.message === "promoted_facts must be an array" ||
    error.message === "promoted_facts items must be objects or strings" ||
    error.message === "summary_tags must be an array"
  ) {
    return res.status(400).json({ error: error.message });
  }

  logger.error("control_api_unhandled_error", {
    error,
  });
  return res.status(500).json({ error: "Internal server error" });
});

const server = app.listen(PORT, () => {
  if (!hasConfiguredInternalToken(CONTROL_API_INTERNAL_TOKEN)) {
    logger.warn("control_api_internal_auth_not_configured", {
      internal_auth_enabled: false,
    });
  }
  logger.info("control_api_started", {
    port: PORT,
  });
});

function shutdown(signal) {
  logger.info("control_api_shutdown_requested", {
    signal,
  });
  server.close(() => {
    pool.end().finally(() => {
      process.exit(0);
    });
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
