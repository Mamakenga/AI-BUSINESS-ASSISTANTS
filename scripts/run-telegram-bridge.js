"use strict";

const {
  buildTelegramIntakeRequest,
  buildTelegramSendMessageRequest,
  parseTelegramTopicMap,
  rememberTelegramTopicMetadata,
} = require("../src/telegram-bridge");
const { setTimeout: sleep } = require("node:timers/promises");

const TELEGRAM_BOT_TOKEN = String(process.env.TELEGRAM_BOT_TOKEN || "").trim();
const CONTROL_API_URL = String(process.env.CONTROL_API_URL || "http://127.0.0.1:3000").trim();
const TELEGRAM_ALLOWED_CHAT_ID = String(process.env.TELEGRAM_ALLOWED_CHAT_ID || "").trim() || null;
const TELEGRAM_POLL_TIMEOUT_SECONDS = Number.parseInt(process.env.TELEGRAM_POLL_TIMEOUT_SECONDS || "30", 10);
const TELEGRAM_TOPIC_MAP = parseTelegramTopicMap(process.env.TELEGRAM_TOPIC_MAP);

if (!TELEGRAM_BOT_TOKEN) {
  throw new Error("TELEGRAM_BOT_TOKEN is required");
}

const TELEGRAM_API_BASE = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;
const TELEGRAM_TOPIC_CACHE = new Map(TELEGRAM_TOPIC_MAP);

function normalizePollTimeoutSeconds(value) {
  if (!Number.isFinite(value) || value <= 0) {
    return 30;
  }
  return Math.min(value, 60);
}

async function telegramApi(method, body) {
  const response = await fetch(`${TELEGRAM_API_BASE}/${method}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;

  if (!response.ok || !payload?.ok) {
    throw new Error(`Telegram API ${method} failed: ${response.status} ${text}`);
  }

  return payload.result;
}

async function callControlApi(path, body) {
  const response = await fetch(`${CONTROL_API_URL}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new Error(`Control API ${path} failed: ${response.status} ${text}`);
  }

  return payload;
}

async function processUpdate(update) {
  rememberTelegramTopicMetadata(update, TELEGRAM_TOPIC_CACHE);

  const request = buildTelegramIntakeRequest(update, {
    allowed_chat_id: TELEGRAM_ALLOWED_CHAT_ID,
    topic_map: TELEGRAM_TOPIC_CACHE,
  });

  if (!request) {
    return false;
  }

  const intakeResponse = await callControlApi("/telegram/intake", request.intake);
  const sendMessagePayload = buildTelegramSendMessageRequest(request.telegram, intakeResponse);

  await telegramApi("sendMessage", sendMessagePayload);
  return true;
}

async function pollOnce(offset) {
  const updates = await telegramApi("getUpdates", {
    offset,
    timeout: normalizePollTimeoutSeconds(TELEGRAM_POLL_TIMEOUT_SECONDS),
    allowed_updates: ["message"],
  });

  let nextOffset = offset;
  for (const update of updates) {
    nextOffset = Math.max(nextOffset, Number(update.update_id) + 1);
    try {
      const processed = await processUpdate(update);
      if (processed) {
        console.log(`[telegram-bridge] processed update ${update.update_id}`);
      }
    } catch (error) {
      console.error(`[telegram-bridge] failed to process update ${update.update_id}`, error);
    }
  }

  return nextOffset;
}

async function main() {
  console.log("[telegram-bridge] starting");
  console.log(`[telegram-bridge] control api: ${CONTROL_API_URL}`);
  if (TELEGRAM_ALLOWED_CHAT_ID) {
    console.log(`[telegram-bridge] allowed chat: ${TELEGRAM_ALLOWED_CHAT_ID}`);
  }

  let offset = 0;
  while (true) {
    try {
      offset = await pollOnce(offset);
    } catch (error) {
      console.error("[telegram-bridge] poll error, retrying in 5s", error);
      await sleep(5000);
    }
  }
}

main().catch((error) => {
  console.error("[telegram-bridge] fatal error", error);
  process.exit(1);
});
