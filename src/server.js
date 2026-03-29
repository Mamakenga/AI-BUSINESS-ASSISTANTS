"use strict";

const crypto = require("node:crypto");
const express = require("express");
const { Pool } = require("pg");
const { buildTelegramIntakePlan } = require("./telegram-intake");
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
const ALLOWED_TASK_ROLES = new Set([
  "orchestrator",
  "assistant",
  "researcher",
  "methodist",
  "finance_analyst",
  "critic",
  "memory_curator",
]);

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
    model_used: row.model_used,
    fallback_chain: row.fallback_chain,
    started_at: row.started_at,
    finished_at: row.finished_at,
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

  if (!intakePlan.should_persist) {
    return res.status(200).json({
      persisted: false,
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
          agent, task_id, thread_id, status
        )
        VALUES ($1, $2, $3, $4)
        RETURNING id, agent, task_id, thread_id, status, model_used, fallback_chain, started_at, finished_at, created_at
      `,
      [
        intakePlan.run.agent,
        intakePlan.run.task_id,
        intakePlan.run.thread_id,
        intakePlan.run.status,
      ]
    );

    await client.query("COMMIT");

    return res.status(201).json({
      persisted: true,
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
