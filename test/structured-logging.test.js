"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { buildLogEntry, buildRunLogFields, createStructuredLogger } = require("../src/structured-logging");

test("buildLogEntry returns structured JSON-safe payload", () => {
  const error = new Error("boom");
  error.executor = {
    retryable: true,
    reason: "upstream_503",
  };
  error.migrate_to_chat_id = "-100123";

  const entry = buildLogEntry({
    level: "info",
    service: "role-worker",
    event: "run_execution_completed",
    fields: {
      run_id: 42,
      fallback_chain: ["scheduled_empty_context_guard"],
      error,
    },
  });

  assert.equal(entry.level, "info");
  assert.equal(entry.service, "role-worker");
  assert.equal(entry.event, "run_execution_completed");
  assert.equal(entry.run_id, 42);
  assert.deepEqual(entry.fallback_chain, ["scheduled_empty_context_guard"]);
  assert.equal(entry.error.message, "boom");
  assert.deepEqual(entry.error.executor, {
    retryable: true,
    reason: "upstream_503",
  });
  assert.equal(entry.error.migrate_to_chat_id, "-100123");
  assert.match(entry.ts, /^\d{4}-\d{2}-\d{2}T/);
});

test("createStructuredLogger writes JSON log lines to the matching sink method", () => {
  const writes = [];
  const sink = {
    log(line) {
      writes.push({ level: "log", line });
    },
    warn(line) {
      writes.push({ level: "warn", line });
    },
    error(line) {
      writes.push({ level: "error", line });
    },
  };

  const logger = createStructuredLogger({
    service: "telegram-bridge",
    sink,
    baseFields: {
      pid: 999,
    },
  });

  logger.info("telegram_update_processed", {
    update_id: 123,
    ack_sent: false,
  });

  assert.equal(writes.length, 1);
  assert.equal(writes[0].level, "log");

  const payload = JSON.parse(writes[0].line);
  assert.equal(payload.service, "telegram-bridge");
  assert.equal(payload.event, "telegram_update_processed");
  assert.equal(payload.pid, 999);
  assert.equal(payload.update_id, 123);
  assert.equal(payload.ack_sent, false);
});

test("buildRunLogFields keeps the core trace identifiers together", () => {
  assert.deepEqual(
    buildRunLogFields({
      id: 55,
      agent: "researcher",
      task_id: "task_7",
      thread_id: "thread_3",
      requested_by_agent: "scheduler",
      dispatch_reason: "competitor watch",
    }),
    {
      run_id: 55,
      agent: "researcher",
      task_id: "task_7",
      thread_id: "thread_3",
      requested_by_agent: "scheduler",
      dispatch_reason: "competitor watch",
    }
  );
});
