"use strict";

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  return Object.getPrototypeOf(value) === Object.prototype;
}

function sanitizeLogValue(value, seen = new WeakSet()) {
  if (value === undefined) {
    return undefined;
  }
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "bigint") {
    return value.toString();
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  let trackedObject = false;
  if (typeof value === "object") {
    if (seen.has(value)) {
      return "[Circular]";
    }
    seen.add(value);
    trackedObject = true;
  }
  if (value instanceof Error) {
    const extraFields = Object.fromEntries(
      Object.entries(value)
        .map(([key, item]) => [key, sanitizeLogValue(item, seen)])
        .filter(([, item]) => item !== undefined)
    );
    const sanitizedError = {
      name: value.name,
      message: value.message,
      stack: value.stack || null,
      ...extraFields,
    };
    if (trackedObject) {
      seen.delete(value);
    }
    return sanitizedError;
  }
  if (Array.isArray(value)) {
    const sanitizedArray = value.map((item) => sanitizeLogValue(item, seen)).filter((item) => item !== undefined);
    if (trackedObject) {
      seen.delete(value);
    }
    return sanitizedArray;
  }
  if (isPlainObject(value)) {
    const sanitizedObject = Object.fromEntries(
      Object.entries(value)
        .map(([key, item]) => [key, sanitizeLogValue(item, seen)])
        .filter(([, item]) => item !== undefined)
    );
    if (trackedObject) {
      seen.delete(value);
    }
    return sanitizedObject;
  }
  if (trackedObject) {
    seen.delete(value);
  }
  return String(value);
}

function buildLogEntry({ level, service, event, fields = {} }) {
  if (!service) {
    throw new Error("service is required");
  }
  if (!event) {
    throw new Error("event is required");
  }

  const sanitizedFields = sanitizeLogValue(fields) || {};

  return {
    ts: new Date().toISOString(),
    level,
    service,
    event,
    ...sanitizedFields,
  };
}

function createStructuredLogger({ service, sink = console, baseFields = {} }) {
  const methodByLevel = {
    info: "log",
    warn: "warn",
    error: "error",
  };

  function emit(level, event, fields = {}) {
    const entry = buildLogEntry({
      level,
      service,
      event,
      fields: {
        ...baseFields,
        ...fields,
      },
    });

    const sinkMethod = methodByLevel[level] || "log";
    sink[sinkMethod](JSON.stringify(entry));
    return entry;
  }

  return {
    info(event, fields) {
      return emit("info", event, fields);
    },
    warn(event, fields) {
      return emit("warn", event, fields);
    },
    error(event, fields) {
      return emit("error", event, fields);
    },
  };
}

function buildRunLogFields(run, extraFields = {}) {
  const normalizedRun = run && typeof run === "object" ? run : {};
  return {
    run_id: normalizedRun.id ?? null,
    agent: normalizedRun.agent ?? null,
    task_id: normalizedRun.task_id ?? null,
    thread_id: normalizedRun.thread_id ?? null,
    requested_by_agent: normalizedRun.requested_by_agent ?? null,
    dispatch_reason: normalizedRun.dispatch_reason ?? null,
    ...extraFields,
  };
}

module.exports = {
  buildLogEntry,
  buildRunLogFields,
  createStructuredLogger,
  sanitizeLogValue,
};
