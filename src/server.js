"use strict";

const crypto = require("node:crypto");
const express = require("express");
const { Pool } = require("pg");
const { buildFollowUpRun } = require("./follow-up-run");
const { buildMemoryBundleRequest, createEmptyBundleResult, trimMemoryBundle } = require("./memory-bundles");
const { buildMemoryCandidate, parseMemoryQuery } = require("./memory-service");
const { buildRunCompletion } = require("./run-completion");
const { buildTelegramIntakePlan } = require("./telegram-intake");
const { buildTelegramReply } = require("./telegram-reply");
const { ALLOWED_TASK_ROLES } = require("./runtime-profiles");
const { resolveTelegramRouting } = require("./telegram-routing");

const PORT = Number.parseInt(process.env.PORT || "3000", 10);
const DATABASE_URL = process.env.DATABASE_URL || "";

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
  const text = normalizeNullableString(req.body.text);
  const topicName = normalizeNullableString(req.body.topic_name);

  if (!text) {
    return res.status(400).json({ error: "text is required" });
  }

  const intakePlan = buildTelegramIntakePlan({
    text,
    topic_name: topicName,
    is_group_context: req.body.is_group_context !== false,
  });
  const reply = buildTelegramReply(intakePlan, {
    topic_name: topicName,
  });

  if (!intakePlan.should_persist) {
    return res.status(200).json({
      persisted: false,
      reply,
      ...intakePlan,
    });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

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

    return res.status(201).json({
      persisted: true,
      reply,
      route: intakePlan.route,
      thread_id: intakePlan.thread_id,
      task: taskRow,
      founder_message: mapMessageRow(messageResult.rows[0]),
      run: mapRunRow(runResult.rows[0]),
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

    return res.status(201).json({
      run: mapRunRow(runResult.rows[0]),
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

    return res.status(200).json({
      run: mapRunRow(updatedRunResult.rows[0]),
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

  if (error.message && error.message.endsWith("is required")) {
    return res.status(400).json({ error: error.message });
  }

  if (error.message === "Only orchestrator can create follow-up runs") {
    return res.status(400).json({ error: error.message });
  }

  if (error.message === "title is required") {
    return res.status(400).json({ error: error.message });
  }

  console.error(error);
  return res.status(500).json({ error: "Internal server error" });
});

const server = app.listen(PORT, () => {
  console.log(`control-api listening on ${PORT}`);
});

function shutdown(signal) {
  console.log(`received ${signal}, shutting down`);
  server.close(() => {
    pool.end().finally(() => {
      process.exit(0);
    });
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
