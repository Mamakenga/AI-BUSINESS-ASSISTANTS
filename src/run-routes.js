"use strict";

const { buildFollowUpRun } = require("./follow-up-run");
const { buildRunCompletion } = require("./run-completion");
const { buildRunsListQuery } = require("./run-list-query");
const { mapRunRow } = require("./run-row-mapping");
const { buildRunLogFields } = require("./structured-logging");

function mapMessageRow(row) {
  return {
    id: row.id,
    thread_id: row.thread_id,
    task_id: row.task_id,
    from_agent: row.from_agent,
    to_agent: row.to_agent,
    message_type: row.message_type,
    content: row.content,
    status: row.status,
    created_at: row.created_at,
  };
}

function mapArtifactRow(row) {
  return {
    id: row.id,
    task_id: row.task_id,
    artifact_type: row.artifact_type,
    created_by: row.created_by,
    content: row.content,
    created_at: row.created_at,
  };
}

function registerRunRoutes(app, { logger, pool }) {
  app.post("/runs/follow-up", async (req, res, next) => {
    const client = await pool.connect();
    try {
      const followUpRun = buildFollowUpRun(req.body || {});
      await client.query("BEGIN");

      const taskResult = await client.query(
        `
          SELECT id, thread_id
          FROM tasks
          WHERE id = $1
          FOR UPDATE
        `,
        [followUpRun.run.task_id]
      );

      if (taskResult.rowCount === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "Task not found" });
      }

      const taskRow = taskResult.rows[0];
      if (taskRow.thread_id !== followUpRun.run.thread_id) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "task_id and thread_id do not match" });
      }

      const runResult = await client.query(
        `
          INSERT INTO runs (
            agent, task_id, thread_id, status, requested_by_agent, dispatch_reason
          )
          VALUES ($1, $2, $3, $4, $5, $6)
          RETURNING id, agent, task_id, thread_id, status, requested_by_agent, dispatch_reason, model_used, fallback_chain, usage_json, prompt_tokens, completion_tokens, total_tokens, response_cost_usd, started_at, finished_at, created_at
        `,
        [
          followUpRun.run.agent,
          followUpRun.run.task_id,
          followUpRun.run.thread_id,
          followUpRun.run.status,
          followUpRun.run.requested_by_agent,
          followUpRun.run.dispatch_reason,
        ]
      );

      const messageResult = await client.query(
        `
          INSERT INTO messages (
            thread_id, task_id, from_agent, to_agent, message_type, content, status
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          RETURNING id, thread_id, task_id, from_agent, to_agent, message_type, content, status, created_at
        `,
        [
          followUpRun.handoff_message.thread_id,
          followUpRun.handoff_message.task_id,
          followUpRun.handoff_message.from_agent,
          followUpRun.handoff_message.to_agent,
          followUpRun.handoff_message.message_type,
          followUpRun.handoff_message.content,
          followUpRun.handoff_message.status,
        ]
      );

      await client.query("COMMIT");

      const mappedRun = mapRunRow(runResult.rows[0]);
      logger.info(
        "follow_up_run_created",
        buildRunLogFields(mappedRun, {
          handoff_from_agent: followUpRun.handoff_message.from_agent,
          handoff_to_agent: followUpRun.handoff_message.to_agent,
        })
      );

      return res.status(201).json({
        run: mappedRun,
        handoff_message: mapMessageRow(messageResult.rows[0]),
      });
    } catch (error) {
      await client.query("ROLLBACK");
      return next(error);
    } finally {
      client.release();
    }
  });

  app.post("/runs/:id/complete", async (req, res, next) => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const runResult = await client.query(
        `
          SELECT id, agent, task_id, thread_id, status, requested_by_agent, dispatch_reason, model_used, fallback_chain, usage_json, prompt_tokens, completion_tokens, total_tokens, response_cost_usd, started_at, finished_at, created_at
          FROM runs
          WHERE id = $1
          FOR UPDATE
        `,
        [req.params.id]
      );

      if (runResult.rowCount === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "Run not found" });
      }

      const runRow = runResult.rows[0];
      const completion = buildRunCompletion(req.body || {}, runRow);

      const updatedRunResult = await client.query(
        `
          UPDATE runs
          SET
            status = $2,
            model_used = $3,
            fallback_chain = $4,
            usage_json = $5,
            prompt_tokens = $6,
            completion_tokens = $7,
            total_tokens = $8,
            response_cost_usd = $9,
            started_at = COALESCE(started_at, now()),
            finished_at = now()
          WHERE id = $1
          RETURNING id, agent, task_id, thread_id, status, requested_by_agent, dispatch_reason, model_used, fallback_chain, usage_json, prompt_tokens, completion_tokens, total_tokens, response_cost_usd, started_at, finished_at, created_at
        `,
        [
          req.params.id,
          completion.run_update.status,
          completion.run_update.model_used,
          JSON.stringify(completion.run_update.fallback_chain),
          completion.run_update.usage_json ? JSON.stringify(completion.run_update.usage_json) : null,
          completion.run_update.prompt_tokens,
          completion.run_update.completion_tokens,
          completion.run_update.total_tokens,
          completion.run_update.response_cost_usd,
        ]
      );

      let artifactRow = null;
      if (completion.artifact) {
        const artifactResult = await client.query(
          `
            INSERT INTO artifacts (
              task_id, artifact_type, created_by, content
            )
            VALUES ($1, $2, $3, $4)
            RETURNING id, task_id, artifact_type, created_by, content, created_at
          `,
          [
            completion.artifact.task_id,
            completion.artifact.artifact_type,
            completion.artifact.created_by,
            JSON.stringify(completion.artifact.content),
          ]
        );
        artifactRow = mapArtifactRow(artifactResult.rows[0]);
      }

      await client.query("COMMIT");

      const mappedRun = mapRunRow(updatedRunResult.rows[0]);
      logger.info(
        "run_completed",
        buildRunLogFields(mappedRun, {
          model_used: mappedRun.model_used,
          fallback_chain: mappedRun.fallback_chain,
          fallback_count: Array.isArray(mappedRun.fallback_chain) ? mappedRun.fallback_chain.length : 0,
          prompt_tokens: mappedRun.prompt_tokens,
          completion_tokens: mappedRun.completion_tokens,
          total_tokens: mappedRun.total_tokens,
          response_cost_usd: mappedRun.response_cost_usd,
          artifact_created: Boolean(artifactRow),
          artifact_type: artifactRow?.artifact_type || null,
        })
      );

      return res.status(200).json({
        run: mappedRun,
        artifact: artifactRow,
      });
    } catch (error) {
      await client.query("ROLLBACK");
      return next(error);
    } finally {
      client.release();
    }
  });

  app.get("/runs", async (req, res, next) => {
    try {
      const listQuery = buildRunsListQuery(req.query || {});
      const result = await pool.query(listQuery.sql, listQuery.values);

      return res.json({
        items: result.rows.map(mapRunRow),
        filters: listQuery.filters,
      });
    } catch (error) {
      return next(error);
    }
  });
}

module.exports = {
  mapArtifactRow,
  mapMessageRow,
  registerRunRoutes,
};
