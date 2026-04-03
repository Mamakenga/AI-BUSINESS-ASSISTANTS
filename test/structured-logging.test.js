"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { buildLogEntry, buildRunLogFields, createStructuredLogger, sanitizeLogValue } = require("../src/structured-logging");

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

test("buildLogEntry requires service and event", () => {
  assert.throws(
    () =>
      buildLogEntry({
        level: "info",
        event: "missing_service",
      }),
    /service is required/
  );

  assert.throws(
    () =>
      buildLogEntry({
        level: "info",
        service: "control-api",
      }),
    /event is required/
  );
});

test("sanitizeLogValue handles circular structures without throwing", () => {
  const value = {
    id: 42,
    created_at: new Date("2026-04-03T10:00:00.000Z"),
    count: 7n,
  };
  value.self = value;

  assert.deepEqual(sanitizeLogValue(value), {
    id: 42,
    created_at: "2026-04-03T10:00:00.000Z",
    count: "7",
    self: "[Circular]",
  });
});

test("sanitizeLogValue preserves repeated shared references that are not circular", () => {
  const shared = {
    kind: "shared",
  };

  assert.deepEqual(
    sanitizeLogValue({
      a: shared,
      b: shared,
    }),
    {
      a: {
        kind: "shared",
      },
      b: {
        kind: "shared",
      },
    }
  );
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

test("buildRunLogFields stays null-safe for missing run objects", () => {
  assert.deepEqual(buildRunLogFields(null), {
    run_id: null,
    agent: null,
    task_id: null,
    thread_id: null,
    requested_by_agent: null,
    dispatch_reason: null,
  });
});
