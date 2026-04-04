"use strict";

const {
  buildTelegramIntakeRequest,
  buildTelegramSendMessageRequest,
  parseTelegramTopicMap,
  rememberTelegramTopicMetadata,
} = require("../src/telegram-bridge");
const { callTelegramApi, normalizeTelegramBotConfig } = require("../src/telegram-bot-client");
const { createStructuredLogger } = require("../src/structured-logging");
const { setTimeout: sleep } = require("node:timers/promises");
const { buildInternalAuthHeaders } = require("../src/control-api-auth");

const CONTROL_API_URL = String(process.env.CONTROL_API_URL || "http://127.0.0.1:3000").trim();
const CONTROL_API_INTERNAL_TOKEN = String(process.env.CONTROL_API_INTERNAL_TOKEN || "").trim();
const TELEGRAM_ALLOWED_CHAT_ID = String(process.env.TELEGRAM_ALLOWED_CHAT_ID || "").trim() || null;
const TELEGRAM_POLL_TIMEOUT_SECONDS = Number.parseInt(process.env.TELEGRAM_POLL_TIMEOUT_SECONDS || "30", 10);
const TELEGRAM_TOPIC_MAP = parseTelegramTopicMap(process.env.TELEGRAM_TOPIC_MAP);
const TELEGRAM_CONFIG = normalizeTelegramBotConfig(process.env);
const TELEGRAM_TOPIC_CACHE = new Map(TELEGRAM_TOPIC_MAP);
const logger = createStructuredLogger({
  service: "telegram-bridge",
  baseFields: {
    pid: process.pid,
  },
});

function normalizePollTimeoutSeconds(value) {
  if (!Number.isFinite(value) || value <= 0) {
    return 30;
  }
  return Math.min(value, 60);
}

async function callControlApi(path, body) {
  const response = await fetch(`${CONTROL_API_URL}${path}`, {
    method: "POST",
    headers: buildInternalAuthHeaders(CONTROL_API_INTERNAL_TOKEN, {
      "content-type": "application/json",
    }),
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

  let request = null;
  let intakeResponse = null;
  try {
    request = buildTelegramIntakeRequest(update, {
      allowed_chat_id: TELEGRAM_ALLOWED_CHAT_ID,
      topic_map: TELEGRAM_TOPIC_CACHE,
    });

    if (!request) {
      return null;
    }

    const intakeBody = {
      ...request.intake,
      telegram: request.telegram,
    };
    intakeResponse = await callControlApi("/telegram/intake", intakeBody);
    const sendMessagePayload = buildTelegramSendMessageRequest(request.telegram, intakeResponse);

    if (sendMessagePayload) {
      await callTelegramApi("sendMessage", sendMessagePayload, {
        config: TELEGRAM_CONFIG,
      });
    }
    return {
      request,
      intake_response: intakeResponse,
      ack_sent: Boolean(sendMessagePayload),
    };
  } catch (error) {
    error.telegram_update_context = {
      chat_id: request?.telegram?.chat_id || update?.message?.chat?.id || null,
      message_id: request?.telegram?.message_id || update?.message?.message_id || null,
      message_thread_id: request?.telegram?.message_thread_id || update?.message?.message_thread_id || null,
      topic_name: request?.telegram?.topic_name || null,
      thread_id: intakeResponse?.thread_id || null,
      run_id: intakeResponse?.run?.id || null,
      task_id: intakeResponse?.task?.id || null,
    };
    throw error;
  }
}

async function pollOnce(offset) {
  const updates = await callTelegramApi("getUpdates", {
    offset,
    timeout: normalizePollTimeoutSeconds(TELEGRAM_POLL_TIMEOUT_SECONDS),
    allowed_updates: ["message"],
  }, {
    config: TELEGRAM_CONFIG,
  });

  let nextOffset = offset;
  for (const update of updates) {
    nextOffset = Math.max(nextOffset, Number(update.update_id) + 1);
    try {
      const result = await processUpdate(update);
      if (result) {
        logger.info("telegram_update_processed", {
          update_id: update.update_id,
          chat_id: result.request.telegram.chat_id,
          message_id: result.request.telegram.message_id,
          message_thread_id: result.request.telegram.message_thread_id,
          topic_name: result.request.telegram.topic_name,
          thread_id: result.intake_response.thread_id || null,
          run_id: result.intake_response.run?.id || null,
          task_id: result.intake_response.task?.id || null,
          interaction_type: result.intake_response.route?.interaction_type || null,
          resolved_role: result.intake_response.route?.resolved_role || null,
          ack_sent: result.ack_sent,
        });
      }
    } catch (error) {
      logger.error("telegram_update_failed", {
        update_id: update.update_id,
        ...error.telegram_update_context,
        error,
      });
    }
  }

  return nextOffset;
}

async function main() {
  logger.info("bridge_started", {
    control_api_url: CONTROL_API_URL,
    allowed_chat_id: TELEGRAM_ALLOWED_CHAT_ID,
  });

  let offset = 0;
  while (true) {
    try {
      offset = await pollOnce(offset);
    } catch (error) {
      logger.error("bridge_poll_failed", {
        poll_retry_ms: 5000,
        error,
      });
      await sleep(5000);
    }
  }
}

main().catch((error) => {
  logger.error("bridge_fatal_error", {
    error,
  });
  process.exit(1);
});
