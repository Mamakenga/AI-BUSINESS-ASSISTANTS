"use strict";

const crypto = require("node:crypto");
const express = require("express");
const { Pool } = require("pg");
const { authorizeInternalRequest } = require("./control-api-auth");
const { buildFollowUpRun } = require("./follow-up-run");
const { buildJobTrigger } = require("./job-trigger");
const {
  buildJobSyncPlan,
  getRegisteredJobMap,
  mergeRegisteredJobWithStoredRow,
  mergeRegisteredJobsWithStoredRows,
} = require("./jobs-registry");
const { buildMemoryBundleRequest, createEmptyBundleResult, trimMemoryBundle } = require("./memory-bundles");
const { buildMemoryCompaction, normalizeSourceMemoryIds } = require("./memory-compaction");
const { buildMemoryCandidate, parseMemoryQuery } = require("./memory-service");
const { buildRunCompletion } = require("./run-completion");
const { buildRunLogFields, createStructuredLogger } = require("./structured-logging");
const { buildTelegramIntakePlan } = require("./telegram-intake");
const { buildTelegramContext, resolveTelegramIntakeContext } = require("./telegram-intake-context");
const { buildTelegramReply } = require("./telegram-reply");
const { ALLOWED_TASK_ROLES } = require("./runtime-profiles");
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

const ALLOWED_TASK_STATUSES = new Set(["inbox", "in_work", "done"]);
const ALLOWED_TASK_PRIORITIES = new Set(["low", "medium", "high", "urgent"]);
function parseLimit(value, fallback = 50, max = 200) {
  const parsed = Number.parseInt(value || "", 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.min(parsed, max);
}

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

function normalizeTaskStatus(value) {
  const normalized = normalizeNullableString(value);
  if (normalized === undefined) {
    return undefined;
  }
  if (!normalized || !ALLOWED_TASK_STATUSES.has(normalized)) {
    throw new Error("Invalid task status");
  }
  return normalized;
}

function normalizeTaskPriority(value) {
  const normalized = normalizeNullableString(value);
  if (normalized === undefined) {
    return undefined;
  }
  if (!normalized || !ALLOWED_TASK_PRIORITIES.has(normalized)) {
    throw new Error("Invalid task priority");
  }
  return normalized;
}

function normalizeTaskRole(value) {
  const normalized = normalizeNullableString(value);
  if (normalized === undefined) {
    return undefined;
  }
  if (normalized === null) {
    return null;
  }
  if (!ALLOWED_TASK_ROLES.has(normalized)) {
    throw new Error("Invalid assigned_role");
  }
  return normalized;
}

function normalizeBoardOrder(value) {
  if (value === undefined) {
    return undefined;
  }
  const parsed = Number.parseInt(String(value), 10);
  if (Number.isNaN(parsed)) {
    throw new Error("Invalid board_order");
  }
  return parsed;
}

function normalizeDueAt(value) {
  const normalized = normalizeNullableString(value);
  if (normalized === undefined) {
    return undefined;
  }
  if (normalized === null) {
    return null;
  }
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) {
    throw new Error("Invalid due_at");
  }
  return date.toISOString();
}

function isJobRegistryError(message) {
  return (
    typeof message === "string" &&
    (message.startsWith("Duplicate stored jobs for job_type:") ||
      message.startsWith("Unknown assigned_agent in job registry:") ||
      message.startsWith("Duplicate registered job_type:"))
  );
}

function requireInternalAuth(req, res) {
  const authResult = authorizeInternalRequest(req.headers, CONTROL_API_INTERNAL_TOKEN);
  if (authResult.ok) {
    return null;
  }

  return res.status(authResult.status).json(authResult.body);
}

function normalizeTitle(value) {
  const normalized = normalizeNullableString(value);
  if (!normalized) {
    throw new Error("title is required");
  }
  return normalized;
}

function mapTaskRow(row) {
  return {
    id: row.id,
    title: row.title,
    status: row.status,
    assigned_role: row.assigned_role,
    priority: row.priority,
    due_at: row.due_at,
    thread_id: row.thread_id,
    board_order: row.board_order,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function mapMessageRow(row) {
  return {
    id: row.id,
    thread_id: row.thread_id,
    task_id: row.task_id,
    from_agent: row.from_agent,
    to_agent: row.to_agent,
    message_type: row.message_type,
    content: row.content,
    status: row.status,
    created_at: row.created_at,
  };
}

function mapRunRow(row) {
  return {
    id: row.id,
    agent: row.agent,
    task_id: row.task_id,
    thread_id: row.thread_id,
    status: row.status,
    requested_by_agent: row.requested_by_agent,
    dispatch_reason: row.dispatch_reason,
    model_used: row.model_used,
    fallback_chain: row.fallback_chain,
    started_at: row.started_at,
    finished_at: row.finished_at,
    created_at: row.created_at,
  };
}

function mapArtifactRow(row) {
  return {
    id: row.id,
    task_id: row.task_id,
    artifact_type: row.artifact_type,
    created_by: row.created_by,
    content: row.content,
    created_at: row.created_at,
  };
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

function mapJobRow(row) {
  return {
    id: row.id,
    job_type: row.job_type,
    assigned_agent: row.assigned_agent,
    schedule: row.schedule,
    enabled: row.enabled,
    last_run_at: row.last_run_at,
    next_run_at: row.next_run_at,
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

function buildTaskUpdate(body) {
  const candidate = {
    title: body.title !== undefined ? normalizeTitle(body.title) : undefined,
    status: normalizeTaskStatus(body.status),
    assigned_role: normalizeTaskRole(body.assigned_role),
    priority: normalizeTaskPriority(body.priority),
    due_at: normalizeDueAt(body.due_at),
    thread_id: normalizeNullableString(body.thread_id),
    board_order: normalizeBoardOrder(body.board_order),
  };

  return Object.entries(candidate).filter(([, value]) => value !== undefined);
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

app.get("/jobs", async (_req, res, next) => {
  try {
    const result = await pool.query(
      `
        SELECT id, job_type, assigned_agent, schedule, enabled, last_run_at, next_run_at, created_at
        FROM jobs
        ORDER BY job_type ASC
      `
    );

    return res.json({
      items: mergeRegisteredJobsWithStoredRows(result.rows.map(mapJobRow)),
    });
  } catch (error) {
    return next(error);
  }
});

app.post("/jobs/sync", async (_req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock($1)", [JOBS_LOCK_KEY]);

    const existingResult = await client.query(
      `
        SELECT id, job_type, assigned_agent, schedule, enabled, last_run_at, next_run_at, created_at
        FROM jobs
        ORDER BY job_type ASC, id ASC
        FOR UPDATE
      `
    );

    const existingRows = existingResult.rows.map(mapJobRow);
    const plan = buildJobSyncPlan(existingRows);

    const inserted = [];
    for (const job of plan.inserts) {
      const insertResult = await client.query(
        `
          INSERT INTO jobs (
            job_type, assigned_agent, schedule, enabled
          )
          VALUES ($1, $2, $3, $4)
          RETURNING id, job_type, assigned_agent, schedule, enabled, last_run_at, next_run_at, created_at
        `,
        [job.job_type, job.assigned_agent, job.schedule, job.enabled]
      );
      inserted.push(mapJobRow(insertResult.rows[0]));
    }

    const updated = [];
    for (const job of plan.updates) {
      const updateResult = await client.query(
        `
          UPDATE jobs
          SET
            assigned_agent = $2,
            schedule = $3
          WHERE id = $1
          RETURNING id, job_type, assigned_agent, schedule, enabled, last_run_at, next_run_at, created_at
        `,
        [job.id, job.assigned_agent, job.schedule]
      );
      updated.push(mapJobRow(updateResult.rows[0]));
    }

    const syncedResult = await client.query(
      `
        SELECT id, job_type, assigned_agent, schedule, enabled, last_run_at, next_run_at, created_at
        FROM jobs
        ORDER BY job_type ASC
      `
    );

    await client.query("COMMIT");

    return res.status(200).json({
      inserted,
      updated,
      unchanged: plan.unchanged,
      items: mergeRegisteredJobsWithStoredRows(syncedResult.rows.map(mapJobRow)),
    });
  } catch (error) {
    if (client) {
      await client.query("ROLLBACK");
    }
    return next(error);
  } finally {
    if (client) {
      client.release();
    }
  }
});

app.post("/jobs/:jobType/trigger", async (req, res, next) => {
  const authFailure = requireInternalAuth(req, res);
  if (authFailure) {
    return authFailure;
  }

  const client = await pool.connect();
  let transactionStarted = false;
  try {
    const registeredJob = getRegisteredJobMap().get(String(req.params.jobType || "").trim());
    if (!registeredJob) {
      return res.status(404).json({ error: "Registered job not found" });
    }

    const trigger = buildJobTrigger(req.body || {}, registeredJob);

    await client.query("BEGIN");
    transactionStarted = true;
    await client.query("SELECT pg_advisory_xact_lock($1)", [JOBS_LOCK_KEY]);

    const existingJobResult = await client.query(
      `
        SELECT id, job_type, assigned_agent, schedule, enabled, last_run_at, next_run_at, created_at
        FROM jobs
        WHERE job_type = $1
        FOR UPDATE
      `,
      [registeredJob.job_type]
    );

    let jobRow;
    if (existingJobResult.rowCount === 0) {
      const insertJobResult = await client.query(
        `
          INSERT INTO jobs (
            job_type, assigned_agent, schedule, enabled
          )
          VALUES ($1, $2, $3, TRUE)
          RETURNING id, job_type, assigned_agent, schedule, enabled, last_run_at, next_run_at, created_at
        `,
        [registeredJob.job_type, registeredJob.assigned_agent, registeredJob.schedule]
      );
      jobRow = mapJobRow(insertJobResult.rows[0]);
    } else if (existingJobResult.rowCount > 1) {
      throw new Error(`Duplicate stored jobs for job_type: ${registeredJob.job_type}`);
    } else {
      jobRow = mapJobRow(existingJobResult.rows[0]);
    }

    if (!jobRow.enabled) {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "Job is disabled" });
    }

    const runResult = await client.query(
      `
        INSERT INTO runs (
          agent, task_id, thread_id, status, requested_by_agent, dispatch_reason
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id, agent, task_id, thread_id, status, requested_by_agent, dispatch_reason, model_used, fallback_chain, started_at, finished_at, created_at
      `,
      [
        trigger.run.agent,
        trigger.run.task_id,
        trigger.run.thread_id,
        trigger.run.status,
        trigger.run.requested_by_agent,
        trigger.run.dispatch_reason,
      ]
    );

    const updatedJobResult = await client.query(
      `
        UPDATE jobs
        SET
          next_run_at = COALESCE($2, next_run_at)
        WHERE id = $1
        RETURNING id, job_type, assigned_agent, schedule, enabled, last_run_at, next_run_at, created_at
      `,
      [jobRow.id, trigger.job_update.next_run_at]
    );

    await client.query("COMMIT");

    const mergedJob = mergeRegisteredJobWithStoredRow(mapJobRow(updatedJobResult.rows[0]));
    if (!mergedJob) {
      throw new Error(`Failed to merge triggered job snapshot for job_type: ${registeredJob.job_type}`);
    }

    const mappedRun = mapRunRow(runResult.rows[0]);
    logger.info(
      "scheduled_job_triggered",
      buildRunLogFields(mappedRun, {
        job_type: mergedJob.job_type,
        next_run_at: mergedJob.next_run_at,
      })
    );

    return res.status(201).json({
      job: mergedJob,
      run: mappedRun,
      trigger: trigger.trigger,
    });
  } catch (error) {
    if (transactionStarted) {
      await client.query("ROLLBACK");
    }
    return next(error);
  } finally {
    client.release();
  }
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
        RETURNING id, agent, task_id, thread_id, status, requested_by_agent, dispatch_reason, model_used, fallback_chain, started_at, finished_at, created_at
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

app.post("/runs/follow-up", async (req, res, next) => {
  const client = await pool.connect();
  try {
    const followUpRun = buildFollowUpRun(req.body || {});
    await client.query("BEGIN");

    const taskResult = await client.query(
      `
        SELECT id, thread_id
        FROM tasks
        WHERE id = $1
        FOR UPDATE
      `,
      [followUpRun.run.task_id]
    );

    if (taskResult.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Task not found" });
    }

    const taskRow = taskResult.rows[0];
    if (taskRow.thread_id !== followUpRun.run.thread_id) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "task_id and thread_id do not match" });
    }

    const runResult = await client.query(
      `
        INSERT INTO runs (
          agent, task_id, thread_id, status, requested_by_agent, dispatch_reason
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id, agent, task_id, thread_id, status, requested_by_agent, dispatch_reason, model_used, fallback_chain, started_at, finished_at, created_at
      `,
      [
        followUpRun.run.agent,
        followUpRun.run.task_id,
        followUpRun.run.thread_id,
        followUpRun.run.status,
        followUpRun.run.requested_by_agent,
        followUpRun.run.dispatch_reason,
      ]
    );

    const messageResult = await client.query(
      `
        INSERT INTO messages (
          thread_id, task_id, from_agent, to_agent, message_type, content, status
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id, thread_id, task_id, from_agent, to_agent, message_type, content, status, created_at
      `,
      [
        followUpRun.handoff_message.thread_id,
        followUpRun.handoff_message.task_id,
        followUpRun.handoff_message.from_agent,
        followUpRun.handoff_message.to_agent,
        followUpRun.handoff_message.message_type,
        followUpRun.handoff_message.content,
        followUpRun.handoff_message.status,
      ]
    );

    await client.query("COMMIT");

    const mappedRun = mapRunRow(runResult.rows[0]);
    logger.info(
      "follow_up_run_created",
      buildRunLogFields(mappedRun, {
        handoff_from_agent: followUpRun.handoff_message.from_agent,
        handoff_to_agent: followUpRun.handoff_message.to_agent,
      })
    );

    return res.status(201).json({
      run: mappedRun,
      handoff_message: mapMessageRow(messageResult.rows[0]),
    });
  } catch (error) {
    await client.query("ROLLBACK");
    return next(error);
  } finally {
    client.release();
  }
});

app.post("/runs/:id/complete", async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const runResult = await client.query(
      `
        SELECT id, agent, task_id, thread_id, status, requested_by_agent, dispatch_reason, model_used, fallback_chain, started_at, finished_at, created_at
        FROM runs
        WHERE id = $1
        FOR UPDATE
      `,
      [req.params.id]
    );

    if (runResult.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Run not found" });
    }

    const runRow = runResult.rows[0];
    const completion = buildRunCompletion(req.body || {}, runRow);

    const updatedRunResult = await client.query(
      `
        UPDATE runs
        SET
          status = $2,
          model_used = $3,
          fallback_chain = $4,
          started_at = COALESCE(started_at, now()),
          finished_at = now()
        WHERE id = $1
        RETURNING id, agent, task_id, thread_id, status, requested_by_agent, dispatch_reason, model_used, fallback_chain, started_at, finished_at, created_at
      `,
      [
        req.params.id,
        completion.run_update.status,
        completion.run_update.model_used,
        JSON.stringify(completion.run_update.fallback_chain),
      ]
    );

    let artifactRow = null;
    if (completion.artifact) {
      const artifactResult = await client.query(
        `
          INSERT INTO artifacts (
            task_id, artifact_type, created_by, content
          )
          VALUES ($1, $2, $3, $4)
          RETURNING id, task_id, artifact_type, created_by, content, created_at
        `,
        [
          completion.artifact.task_id,
          completion.artifact.artifact_type,
          completion.artifact.created_by,
          JSON.stringify(completion.artifact.content),
        ]
      );
      artifactRow = mapArtifactRow(artifactResult.rows[0]);
    }

    await client.query("COMMIT");

    const mappedRun = mapRunRow(updatedRunResult.rows[0]);
    logger.info(
      "run_completed",
      buildRunLogFields(mappedRun, {
        model_used: mappedRun.model_used,
        fallback_chain: mappedRun.fallback_chain,
        fallback_count: Array.isArray(mappedRun.fallback_chain) ? mappedRun.fallback_chain.length : 0,
        artifact_created: Boolean(artifactRow),
        artifact_type: artifactRow?.artifact_type || null,
      })
    );

    return res.status(200).json({
      run: mappedRun,
      artifact: artifactRow,
    });
  } catch (error) {
    await client.query("ROLLBACK");
    return next(error);
  } finally {
    client.release();
  }
});

app.get("/tasks", async (req, res, next) => {
  try {
    const where = [];
    const values = [];

    const status = normalizeTaskStatus(req.query.status);
    if (status) {
      values.push(status);
      where.push(`status = $${values.length}`);
    }

    const assignedRole = normalizeTaskRole(req.query.assigned_role);
    if (assignedRole) {
      values.push(assignedRole);
      where.push(`assigned_role = $${values.length}`);
    }

    const limit = parseLimit(req.query.limit, 50, 200);
    values.push(limit);

    const query = `
      SELECT id, title, status, assigned_role, priority, due_at, thread_id, board_order, created_at, updated_at
      FROM tasks
      ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY
        CASE status
          WHEN 'inbox' THEN 1
          WHEN 'in_work' THEN 2
          WHEN 'done' THEN 3
          ELSE 99
        END,
        board_order ASC,
        updated_at DESC
      LIMIT $${values.length}
    `;

    const result = await pool.query(query, values);
    return res.json({
      items: result.rows.map(mapTaskRow),
    });
  } catch (error) {
    return next(error);
  }
});

app.get("/tasks/:id", async (req, res, next) => {
  try {
    const result = await pool.query(
      `
        SELECT id, title, status, assigned_role, priority, due_at, thread_id, board_order, created_at, updated_at
        FROM tasks
        WHERE id = $1
      `,
      [req.params.id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Task not found" });
    }

    return res.json(mapTaskRow(result.rows[0]));
  } catch (error) {
    return next(error);
  }
});

app.post("/tasks", async (req, res, next) => {
  try {
    const id = normalizeNullableString(req.body.id) || `task_${crypto.randomUUID()}`;
    const title = normalizeTitle(req.body.title);
    const status = normalizeTaskStatus(req.body.status) || "inbox";
    const assignedRole = normalizeTaskRole(req.body.assigned_role) ?? null;
    const priority = normalizeTaskPriority(req.body.priority) || "medium";
    const dueAt = normalizeDueAt(req.body.due_at) ?? null;
    const threadId = normalizeNullableString(req.body.thread_id) ?? null;
    const boardOrder = normalizeBoardOrder(req.body.board_order) ?? 0;

    const result = await pool.query(
      `
        INSERT INTO tasks (
          id, title, status, assigned_role, priority, due_at, thread_id, board_order
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id, title, status, assigned_role, priority, due_at, thread_id, board_order, created_at, updated_at
      `,
      [id, title, status, assignedRole, priority, dueAt, threadId, boardOrder]
    );

    return res.status(201).json(mapTaskRow(result.rows[0]));
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({ error: "Task id already exists" });
    }
    return next(error);
  }
});

app.patch("/tasks/:id", async (req, res, next) => {
  try {
    const updates = buildTaskUpdate(req.body || {});
    if (updates.length === 0) {
      return res.status(400).json({ error: "No valid task fields provided" });
    }

    const values = [req.params.id];
    const setClauses = updates.map(([field, value]) => {
      values.push(value);
      return `${field} = $${values.length}`;
    });

    const result = await pool.query(
      `
        UPDATE tasks
        SET ${setClauses.join(", ")}, updated_at = now()
        WHERE id = $1
        RETURNING id, title, status, assigned_role, priority, due_at, thread_id, board_order, created_at, updated_at
      `,
      values
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Task not found" });
    }

    return res.json(mapTaskRow(result.rows[0]));
  } catch (error) {
    return next(error);
  }
});

app.use((error, _req, res, _next) => {
  if (error.message && error.message.startsWith("Invalid")) {
    return res.status(400).json({ error: error.message });
  }

  if (error.message === "fallback_chain must be an array") {
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
