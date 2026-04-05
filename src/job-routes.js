"use strict";

const { buildJobTrigger } = require("./job-trigger");
const {
  buildJobSyncPlan,
  getRegisteredJobMap,
  mergeRegisteredJobWithStoredRow,
  mergeRegisteredJobsWithStoredRows,
} = require("./jobs-registry");
const { mapRunRow } = require("./run-row-mapping");
const { buildRunLogFields } = require("./structured-logging");

function isJobRegistryError(message) {
  return (
    typeof message === "string" &&
    (message.startsWith("Duplicate stored jobs for job_type:") ||
      message.startsWith("Unknown assigned_agent in job registry:") ||
      message.startsWith("Duplicate registered job_type:"))
  );
}

function mapJobRow(row) {
  return {
    id: row.id,
    job_type: row.job_type,
    assigned_agent: row.assigned_agent,
    schedule: row.schedule,
    enabled: row.enabled,
    last_run_at: row.last_run_at,
    next_run_at: row.next_run_at,
    created_at: row.created_at,
  };
}

function registerJobRoutes(app, { jobsLockKey, logger, pool }) {
  app.get("/jobs", async (_req, res, next) => {
    try {
      const result = await pool.query(
        `
          SELECT id, job_type, assigned_agent, schedule, enabled, last_run_at, next_run_at, created_at
          FROM jobs
          ORDER BY job_type ASC
        `
      );

      return res.json({
        items: mergeRegisteredJobsWithStoredRows(result.rows.map(mapJobRow)),
      });
    } catch (error) {
      return next(error);
    }
  });

  app.post("/jobs/sync", async (_req, res, next) => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock($1)", [jobsLockKey]);

      const existingResult = await client.query(
        `
          SELECT id, job_type, assigned_agent, schedule, enabled, last_run_at, next_run_at, created_at
          FROM jobs
          ORDER BY job_type ASC, id ASC
          FOR UPDATE
        `
      );

      const existingRows = existingResult.rows.map(mapJobRow);
      const plan = buildJobSyncPlan(existingRows);

      const inserted = [];
      for (const job of plan.inserts) {
        const insertResult = await client.query(
          `
            INSERT INTO jobs (
              job_type, assigned_agent, schedule, enabled
            )
            VALUES ($1, $2, $3, $4)
            RETURNING id, job_type, assigned_agent, schedule, enabled, last_run_at, next_run_at, created_at
          `,
          [job.job_type, job.assigned_agent, job.schedule, job.enabled]
        );
        inserted.push(mapJobRow(insertResult.rows[0]));
      }

      const updated = [];
      for (const job of plan.updates) {
        const updateResult = await client.query(
          `
            UPDATE jobs
            SET
              assigned_agent = $2,
              schedule = $3
            WHERE id = $1
            RETURNING id, job_type, assigned_agent, schedule, enabled, last_run_at, next_run_at, created_at
          `,
          [job.id, job.assigned_agent, job.schedule]
        );
        updated.push(mapJobRow(updateResult.rows[0]));
      }

      const syncedResult = await client.query(
        `
          SELECT id, job_type, assigned_agent, schedule, enabled, last_run_at, next_run_at, created_at
          FROM jobs
          ORDER BY job_type ASC
        `
      );

      await client.query("COMMIT");

      return res.status(200).json({
        inserted,
        updated,
        unchanged: plan.unchanged,
        items: mergeRegisteredJobsWithStoredRows(syncedResult.rows.map(mapJobRow)),
      });
    } catch (error) {
      if (client) {
        await client.query("ROLLBACK");
      }
      return next(error);
    } finally {
      if (client) {
        client.release();
      }
    }
  });

  app.post("/jobs/:jobType/trigger", async (req, res, next) => {
    const client = await pool.connect();
    let transactionStarted = false;
    try {
      const registeredJob = getRegisteredJobMap().get(String(req.params.jobType || "").trim());
      if (!registeredJob) {
        return res.status(404).json({ error: "Registered job not found" });
      }

      const trigger = buildJobTrigger(req.body || {}, registeredJob);

      await client.query("BEGIN");
      transactionStarted = true;
      await client.query("SELECT pg_advisory_xact_lock($1)", [jobsLockKey]);

      const existingJobResult = await client.query(
        `
          SELECT id, job_type, assigned_agent, schedule, enabled, last_run_at, next_run_at, created_at
          FROM jobs
          WHERE job_type = $1
          FOR UPDATE
        `,
        [registeredJob.job_type]
      );

      let jobRow;
      if (existingJobResult.rowCount === 0) {
        const insertJobResult = await client.query(
          `
            INSERT INTO jobs (
              job_type, assigned_agent, schedule, enabled
            )
            VALUES ($1, $2, $3, TRUE)
            RETURNING id, job_type, assigned_agent, schedule, enabled, last_run_at, next_run_at, created_at
          `,
          [registeredJob.job_type, registeredJob.assigned_agent, registeredJob.schedule]
        );
        jobRow = mapJobRow(insertJobResult.rows[0]);
      } else if (existingJobResult.rowCount > 1) {
        throw new Error(`Duplicate stored jobs for job_type: ${registeredJob.job_type}`);
      } else {
        jobRow = mapJobRow(existingJobResult.rows[0]);
      }

      if (!jobRow.enabled) {
        await client.query("ROLLBACK");
        return res.status(409).json({ error: "Job is disabled" });
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
          trigger.run.agent,
          trigger.run.task_id,
          trigger.run.thread_id,
          trigger.run.status,
          trigger.run.requested_by_agent,
          trigger.run.dispatch_reason,
        ]
      );

      const updatedJobResult = await client.query(
        `
          UPDATE jobs
          SET
            next_run_at = COALESCE($2, next_run_at)
          WHERE id = $1
          RETURNING id, job_type, assigned_agent, schedule, enabled, last_run_at, next_run_at, created_at
        `,
        [jobRow.id, trigger.job_update.next_run_at]
      );

      await client.query("COMMIT");

      const mergedJob = mergeRegisteredJobWithStoredRow(mapJobRow(updatedJobResult.rows[0]));
      if (!mergedJob) {
        throw new Error(`Failed to merge triggered job snapshot for job_type: ${registeredJob.job_type}`);
      }

      const mappedRun = mapRunRow(runResult.rows[0]);
      logger.info(
        "scheduled_job_triggered",
        buildRunLogFields(mappedRun, {
          job_type: mergedJob.job_type,
          next_run_at: mergedJob.next_run_at,
        })
      );

      return res.status(201).json({
        job: mergedJob,
        run: mappedRun,
        trigger: trigger.trigger,
      });
    } catch (error) {
      if (transactionStarted) {
        await client.query("ROLLBACK");
      }
      return next(error);
    } finally {
      client.release();
    }
  });
}

module.exports = {
  isJobRegistryError,
  mapJobRow,
  registerJobRoutes,
};
