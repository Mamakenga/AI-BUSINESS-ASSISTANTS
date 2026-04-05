"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  mapTelegramThreadRow,
  normalizeNullableString,
} = require("../src/telegram-routes");

test("normalizeNullableString trims values and preserves undefined for telegram routes", () => {
  assert.equal(normalizeNullableString(undefined), undefined);
  assert.equal(normalizeNullableString(null), null);
  assert.equal(normalizeNullableString("  topic "), "topic");
  assert.equal(normalizeNullableString("   "), null);
});

test("mapTelegramThreadRow keeps telegram thread API shape stable", () => {
  const mapped = mapTelegramThreadRow({
    thread_id: "thread_123",
    chat_id: "-1001",
    message_thread_id: 2,
    topic_name: "01 Assistant",
    last_founder_message_id: 77,
    created_at: "2026-04-05T10:00:00.000Z",
    updated_at: "2026-04-05T10:05:00.000Z",
  });

  assert.deepEqual(mapped, {
    thread_id: "thread_123",
    chat_id: "-1001",
    message_thread_id: 2,
    topic_name: "01 Assistant",
    last_founder_message_id: 77,
    created_at: "2026-04-05T10:00:00.000Z",
    updated_at: "2026-04-05T10:05:00.000Z",
  });
});
