"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  WORKER_ROLE_IDS,
  buildRunCompletionInput,
  buildRunExecutionContext,
  normalizeExecutionResult,
  normalizeWorkerRoleIds,
} = require("../src/run-worker");

test("normalizeWorkerRoleIds defaults to all non-service roles", () => {
  const roleIds = normalizeWorkerRoleIds();

  assert.deepEqual(roleIds, WORKER_ROLE_IDS);
  assert.ok(roleIds.includes("orchestrator"));
  assert.ok(roleIds.includes("assistant"));
  assert.ok(!roleIds.includes("memory_curator"));
});

test("buildRunExecutionContext extracts founder request and handoff messages", () => {
  const context = buildRunExecutionContext({
    run: {
      id: 51,
      agent: "researcher",
      task_id: "task_51",
      thread_id: "thread_51",
      requested_by_agent: "founder",
      dispatch_reason: null,
      created_at: "2026-03-29T10:00:00.000Z",
    },
    task: {
      id: "task_51",
      title: "Compare competitors in Varna",
      status: "inbox",
      assigned_role: "researcher",
      priority: "medium",
      due_at: null,
      thread_id: "thread_51",
    },
    messages: [
      { id: 1, from_agent: "founder", to_agent: "researcher", message_type: "request", content: "@researcher compare competitors", created_at: "2026-03-29T10:00:00.000Z" },
      { id: 2, from_agent: "orchestrator", to_agent: "researcher", message_type: "handoff", content: "Need price comparison.", created_at: "2026-03-29T10:01:00.000Z" },
    ],
    memory_bundle: {
      meta: { total_items: 3 },
    },
  });

  assert.equal(context.founder_request, "@researcher compare competitors");
  assert.equal(context.handoff_messages.length, 1);
  assert.equal(context.handoff_messages[0].content, "Need price comparison.");
  assert.equal(context.role.id, "researcher");
});

test("buildRunCompletionInput creates artifact payload for task-bound run", () => {
  const result = buildRunCompletionInput(
    {
      id: 77,
      agent: "assistant",
      task_id: "task_77",
    },
    {
      status: "completed",
      model_used: "gpt",
      fallback_chain: ["gpt"],
      reply_text: "Here is your digest.",
    }
  );

  assert.equal(result.completion.actor_agent, "assistant");
  assert.equal(result.completion.status, "completed");
  assert.deepEqual(result.completion.artifact_content, {
    reply_text: "Here is your digest.",
  });
});

test("normalizeExecutionResult requires reply_text for direct-answer runs", () => {
  assert.throws(
    () =>
      normalizeExecutionResult(
        {
          id: 88,
          agent: "assistant",
          task_id: null,
        },
        {
          status: "completed",
        }
      ),
    /OpenClaw direct-answer response must include reply_text/
  );
});
