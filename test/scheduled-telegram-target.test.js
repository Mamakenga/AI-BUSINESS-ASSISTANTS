"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { resolveScheduledTelegramTarget } = require("../src/scheduled-telegram-target");

test("resolveScheduledTelegramTarget routes scheduled orchestrator output into known orchestrator topic", () => {
  const target = resolveScheduledTelegramTarget({
    run: {
      agent: "orchestrator",
      requested_by_agent: "scheduler",
    },
    allowed_chat_id: "-5020629823",
    telegram_topic_rows: [
      {
        chat_id: "-5020629823",
        message_thread_id: 101,
        topic_name: "01 Orchestrator",
        updated_at: "2026-03-30T20:00:00.000Z",
      },
    ],
  });

  assert.deepEqual(target, {
    chat_id: "-5020629823",
    message_thread_id: "101",
    topic_name: "01 Orchestrator",
    target_mode: "role_topic",
  });
});

test("resolveScheduledTelegramTarget falls back to general chat when role topic is unknown", () => {
  const target = resolveScheduledTelegramTarget({
    run: {
      agent: "researcher",
      requested_by_agent: "scheduler",
    },
    allowed_chat_id: "-5020629823",
    telegram_topic_rows: [],
  });

  assert.deepEqual(target, {
    chat_id: "-5020629823",
    message_thread_id: null,
    topic_name: "02 Researcher",
    target_mode: "general_chat_fallback",
  });
});

test("resolveScheduledTelegramTarget returns null for non-scheduler runs", () => {
  const target = resolveScheduledTelegramTarget({
    run: {
      agent: "orchestrator",
      requested_by_agent: "founder",
    },
    allowed_chat_id: "-5020629823",
    telegram_topic_rows: [],
  });

  assert.equal(target, null);
});

test("resolveScheduledTelegramTarget returns null for scheduler roles without founder topic", () => {
  const target = resolveScheduledTelegramTarget({
    run: {
      agent: "memory_curator",
      requested_by_agent: "scheduler",
    },
    allowed_chat_id: "-5020629823",
    telegram_topic_rows: [],
  });

  assert.equal(target, null);
});
