"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { FOLLOW_UP_TARGET_ROLE_IDS, buildFollowUpRun } = require("../src/follow-up-run");

test("follow-up runs can target worker roles from orchestrator", () => {
  const run = buildFollowUpRun({
    source_agent: "orchestrator",
    target_agent: "researcher",
    task_id: "task_123",
    thread_id: "thread_123",
    dispatch_reason: "Need competitor comparison before decision",
  });

  assert.deepEqual(run, {
    run: {
      agent: "researcher",
      task_id: "task_123",
      thread_id: "thread_123",
      status: "pending",
      requested_by_agent: "orchestrator",
      dispatch_reason: "Need competitor comparison before decision",
    },
    handoff_message: {
      thread_id: "thread_123",
      task_id: "task_123",
      from_agent: "orchestrator",
      to_agent: "researcher",
      message_type: "handoff",
      content: "Need competitor comparison before decision",
      status: "unread",
    },
  });
});

test("follow-up runs can carry an explicit handoff message", () => {
  const run = buildFollowUpRun({
    source_agent: "orchestrator",
    target_agent: "critic",
    task_id: "task_123",
    thread_id: "thread_123",
    dispatch_reason: "Need a review pass",
    handoff_message: "Проверь, не переоцениваем ли эффект повышения цены.",
  });

  assert.equal(run.handoff_message.content, "Проверь, не переоцениваем ли эффект повышения цены.");
});

test("follow-up runs reject orchestrator as target", () => {
  assert.throws(
    () =>
      buildFollowUpRun({
        source_agent: "orchestrator",
        target_agent: "orchestrator",
        task_id: "task_123",
        thread_id: "thread_123",
      }),
    /Invalid follow-up target_agent/
  );
});

test("follow-up runs reject service-only roles as target", () => {
  assert.equal(FOLLOW_UP_TARGET_ROLE_IDS.has("memory_curator"), false);
});

test("follow-up runs require orchestrator as source", () => {
  assert.throws(
    () =>
      buildFollowUpRun({
        source_agent: "founder",
        target_agent: "assistant",
        task_id: "task_123",
        thread_id: "thread_123",
      }),
    /Only orchestrator can create follow-up runs/
  );
});
