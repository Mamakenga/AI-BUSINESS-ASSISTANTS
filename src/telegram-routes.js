"use strict";

const { mapMessageRow } = require("./run-routes");
const { mapRunRow } = require("./run-row-mapping");
const { buildRunLogFields } = require("./structured-logging");
const { mapTaskRow } = require("./task-routes");
const { normalizeNullableString } = require("./string-normalizers");
const { buildTelegramIntakePlan } = require("./telegram-intake");
const { buildTelegramContext, resolveTelegramIntakeContext } = require("./telegram-intake-context");
const { buildTelegramReply } = require("./telegram-reply");
const { resolveTelegramRouting } = require("./telegram-routing");

function mapTelegramThreadRow(row) {
  return {
    thread_id: row.thread_id,
    chat_id: row.chat_id,
    message_thread_id: row.message_thread_id,
    topic_name: row.topic_name,
    last_founder_message_id: row.last_founder_message_id,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function loadPersistedTelegramTopicName(client, telegramContext) {
  if (
    !telegramContext?.chat_id ||
    telegramContext.message_thread_id === null ||
    telegramContext.message_thread_id === undefined ||
    telegramContext.topic_name
  ) {
    return null;
  }

  const result = await client.query(
    `
      SELECT topic_name
      FROM telegram_threads
      WHERE chat_id = $1
        AND message_thread_id = $2
        AND topic_name IS NOT NULL
      ORDER BY updated_at DESC, created_at DESC
      LIMIT 1
    `,
    [telegramContext.chat_id, telegramContext.message_thread_id]
  );

  return normalizeNullableString(result.rows[0]?.topic_name) || null;
}

function registerTelegramRoutes(app, { logger, pool }) {
  app.post("/telegram/route-preview", (req, res, next) => {
    try {
      const text = normalizeNullableString(req.body.text);
      const topicName = normalizeNullableString(req.body.topic_name);

      if (!text) {
        return res.status(400).json({ error: "text is required" });
      }

      const result = resolveTelegramRouting({
        text,
        topic_name: topicName,
        is_group_context: req.body.is_group_context !== false,
      });

      return res.json(result);
    } catch (error) {
      return next(error);
    }
  });

  app.post("/telegram/intake", async (req, res, next) => {
    let client = null;
    let persistedTopicName = null;
    const telegramContextSeed = buildTelegramContext(req.body.telegram);

    const text = normalizeNullableString(req.body.text);
    if (!text) {
      return res.status(400).json({ error: "text is required" });
    }

    const needsPersistedTopicRestore =
      normalizeNullableString(req.body.topic_name) === null &&
      telegramContextSeed?.topic_name === null &&
      telegramContextSeed?.chat_id &&
      telegramContextSeed?.message_thread_id !== null &&
      telegramContextSeed?.message_thread_id !== undefined;

    try {
      if (needsPersistedTopicRestore) {
        client = await pool.connect();
        persistedTopicName = await loadPersistedTelegramTopicName(client, telegramContextSeed);
      }
    } catch (error) {
      if (client) {
        client.release();
      }
      return next(error);
    }

    const intakeContext = resolveTelegramIntakeContext(req.body, persistedTopicName);
    const topicName = intakeContext.topicName;
    const telegramContext = intakeContext.telegramContext;
    const topicRestored = Boolean(persistedTopicName);
    const intakePlan = buildTelegramIntakePlan({
      text,
      topic_name: topicName,
      is_group_context: req.body.is_group_context !== false,
    });
    const reply = buildTelegramReply(intakePlan, {
      topic_name: topicName,
    });

    if (!intakePlan.should_persist) {
      if (client) {
        client.release();
      }
      logger.info("telegram_intake_skipped", {
        thread_id: intakePlan.thread_id,
        topic_name: topicName,
        topic_restored: topicRestored,
        interaction_type: intakePlan.route?.interaction_type || null,
        resolved_role: intakePlan.route?.resolved_role || null,
        needs_clarification: Boolean(intakePlan.route?.needs_clarification),
        chat_id: telegramContext?.chat_id || null,
        message_thread_id: telegramContext?.message_thread_id ?? null,
      });
      return res.status(200).json({
        persisted: false,
        reply,
        ...intakePlan,
      });
    }

    try {
      if (!client) {
        client = await pool.connect();
      }
      await client.query("BEGIN");

      let telegramThreadRow = null;
      if (telegramContext?.chat_id) {
        const telegramThreadResult = await client.query(
          `
            INSERT INTO telegram_threads (
              thread_id, chat_id, message_thread_id, topic_name, last_founder_message_id
            )
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (thread_id)
            DO UPDATE SET
              chat_id = EXCLUDED.chat_id,
              message_thread_id = EXCLUDED.message_thread_id,
              topic_name = COALESCE(EXCLUDED.topic_name, telegram_threads.topic_name),
              last_founder_message_id = EXCLUDED.last_founder_message_id,
              updated_at = now()
            RETURNING thread_id, chat_id, message_thread_id, topic_name, last_founder_message_id, created_at, updated_at
          `,
          [
            intakePlan.thread_id,
            telegramContext.chat_id,
            telegramContext.message_thread_id,
            telegramContext.topic_name,
            telegramContext.message_id,
          ]
        );
        telegramThreadRow = mapTelegramThreadRow(telegramThreadResult.rows[0]);
      }

      let taskRow = null;
      if (intakePlan.task) {
        const taskResult = await client.query(
          `
            INSERT INTO tasks (
              id, title, status, assigned_role, priority, due_at, thread_id, board_order
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING id, title, status, assigned_role, priority, due_at, thread_id, board_order, created_at, updated_at
          `,
          [
            intakePlan.task.id,
            intakePlan.task.title,
            intakePlan.task.status,
            intakePlan.task.assigned_role,
            intakePlan.task.priority,
            intakePlan.task.due_at,
            intakePlan.task.thread_id,
            intakePlan.task.board_order,
          ]
        );
        taskRow = mapTaskRow(taskResult.rows[0]);
      }

      const messageResult = await client.query(
        `
          INSERT INTO messages (
            thread_id, task_id, from_agent, to_agent, message_type, content, status
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          RETURNING id, thread_id, task_id, from_agent, to_agent, message_type, content, status, created_at
        `,
        [
          intakePlan.founder_message.thread_id,
          intakePlan.founder_message.task_id,
          intakePlan.founder_message.from_agent,
          intakePlan.founder_message.to_agent,
          intakePlan.founder_message.message_type,
          intakePlan.founder_message.content,
          intakePlan.founder_message.status,
        ]
      );

      const runResult = await client.query(
        `
          INSERT INTO runs (
            agent, task_id, thread_id, status, requested_by_agent, dispatch_reason
          )
          VALUES ($1, $2, $3, $4, $5, $6)
          RETURNING id, agent, task_id, thread_id, status, requested_by_agent, dispatch_reason, model_used, fallback_chain, usage_json, prompt_tokens, completion_tokens, total_tokens, response_cost_usd, started_at, finished_at, created_at
        `,
        [
          intakePlan.run.agent,
          intakePlan.run.task_id,
          intakePlan.run.thread_id,
          intakePlan.run.status,
          "founder",
          null,
        ]
      );

      await client.query("COMMIT");

      const mappedRun = mapRunRow(runResult.rows[0]);
      logger.info(
        "telegram_intake_persisted",
        buildRunLogFields(mappedRun, {
          topic_name: topicName,
          topic_restored: topicRestored,
          interaction_type: intakePlan.route?.interaction_type || null,
          resolved_role: intakePlan.route?.resolved_role || null,
          chat_id: telegramContext?.chat_id || null,
          message_thread_id: telegramContext?.message_thread_id ?? null,
        })
      );

      return res.status(201).json({
        persisted: true,
        reply,
        route: intakePlan.route,
        thread_id: intakePlan.thread_id,
        telegram_thread: telegramThreadRow,
        task: taskRow,
        founder_message: mapMessageRow(messageResult.rows[0]),
        run: mappedRun,
      });
    } catch (error) {
      await client.query("ROLLBACK");
      return next(error);
    } finally {
      client.release();
    }
  });
}

module.exports = {
  loadPersistedTelegramTopicName,
  mapTelegramThreadRow,
  normalizeNullableString,
  registerTelegramRoutes,
};
