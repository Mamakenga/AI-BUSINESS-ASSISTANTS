"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { mapArtifactRow, mapMessageRow } = require("../src/run-routes");

test("mapMessageRow keeps handoff and founder message API shape stable", () => {
  const mapped = mapMessageRow({
    id: 7,
    thread_id: "thread_123",
    task_id: "task_123",
    from_agent: "orchestrator",
    to_agent: "researcher",
    message_type: "handoff",
    content: "Need competitor comparison",
    status: "unread",
    created_at: "2026-04-05T10:00:00.000Z",
  });

  assert.deepEqual(mapped, {
    id: 7,
    thread_id: "thread_123",
    task_id: "task_123",
    from_agent: "orchestrator",
    to_agent: "researcher",
    message_type: "handoff",
    content: "Need competitor comparison",
    status: "unread",
    created_at: "2026-04-05T10:00:00.000Z",
  });
});

test("mapArtifactRow keeps run artifact API shape stable", () => {
  const mapped = mapArtifactRow({
    id: 11,
    task_id: "task_123",
    artifact_type: "assistant_summary_v1",
    created_by: "assistant",
    content: { summary: "ready" },
    created_at: "2026-04-05T10:00:00.000Z",
  });

  assert.deepEqual(mapped, {
    id: 11,
    task_id: "task_123",
    artifact_type: "assistant_summary_v1",
    created_by: "assistant",
    content: { summary: "ready" },
    created_at: "2026-04-05T10:00:00.000Z",
  });
});
