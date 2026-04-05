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
const { registerMemoryRoutes } = require("./memory-routes");
const { registerRunRoutes } = require("./run-routes");
const { createStructuredLogger } = require("./structured-logging");
const { registerTaskRoutes } = require("./task-routes");
const { registerTelegramRoutes } = require("./telegram-routes");

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

function requireInternalAuth(req, res) {
  const authResult = authorizeInternalRequest(req.headers, CONTROL_API_INTERNAL_TOKEN);
  if (authResult.ok) {
    return null;
  }

  return res.status(authResult.status).json(authResult.body);
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

registerMemoryRoutes(app, {
  pool,
});

registerTelegramRoutes(app, {
  logger,
  pool,
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
