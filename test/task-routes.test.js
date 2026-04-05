"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildTaskUpdate,
  mapTaskRow,
  normalizeBoardOrder,
  normalizeDueAt,
  normalizeNullableString,
  normalizeTaskPriority,
  normalizeTaskRole,
  normalizeTaskStatus,
  normalizeTitle,
  parseLimit,
} = require("../src/task-routes");

test("task route helpers normalize nullable and bounded values", () => {
  assert.equal(normalizeNullableString(undefined), undefined);
  assert.equal(normalizeNullableString("   "), null);
  assert.equal(normalizeNullableString(" task "), "task");
  assert.equal(parseLimit(undefined), 50);
  assert.equal(parseLimit("999", 50, 200), 200);
  assert.equal(normalizeBoardOrder("7"), 7);
  assert.throws(() => normalizeBoardOrder("nope"), /Invalid board_order/);
});

test("task route helpers validate task fields", () => {
  assert.equal(normalizeTaskStatus("inbox"), "inbox");
  assert.equal(normalizeTaskPriority("urgent"), "urgent");
  assert.equal(normalizeTaskRole("assistant"), "assistant");
  assert.equal(normalizeTaskRole(null), null);
  assert.equal(normalizeTitle("  Draft title "), "Draft title");
  assert.match(normalizeDueAt("2026-04-05T12:00:00Z"), /^2026-04-05T12:00:00\.000Z$/);

  assert.throws(() => normalizeTaskStatus("paused"), /Invalid task status/);
  assert.throws(() => normalizeTaskPriority("critical"), /Invalid task priority/);
  assert.throws(() => normalizeTaskRole("unknown_role"), /Invalid assigned_role/);
  assert.throws(() => normalizeTitle("   "), /title is required/);
  assert.throws(() => normalizeDueAt("not-a-date"), /Invalid due_at/);
});

test("buildTaskUpdate keeps only provided valid task fields", () => {
  const updates = buildTaskUpdate({
    status: "done",
    priority: "high",
    assigned_role: null,
    board_order: "3",
    thread_id: "  thread_123 ",
  });

  assert.deepEqual(updates, [
    ["status", "done"],
    ["assigned_role", null],
    ["priority", "high"],
    ["thread_id", "thread_123"],
    ["board_order", 3],
  ]);
});

test("mapTaskRow keeps API shape stable", () => {
  const mapped = mapTaskRow({
    id: "task_1",
    title: "Test",
    status: "inbox",
    assigned_role: "assistant",
    priority: "medium",
    due_at: null,
    thread_id: "thread_1",
    board_order: 0,
    created_at: "2026-04-05T10:00:00.000Z",
    updated_at: "2026-04-05T10:00:00.000Z",
  });

  assert.deepEqual(mapped, {
    id: "task_1",
    title: "Test",
    status: "inbox",
    assigned_role: "assistant",
    priority: "medium",
    due_at: null,
    thread_id: "thread_1",
    board_order: 0,
    created_at: "2026-04-05T10:00:00.000Z",
    updated_at: "2026-04-05T10:00:00.000Z",
  });
});
