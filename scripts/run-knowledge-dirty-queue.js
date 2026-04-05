"use strict";

const { Pool } = require("pg");
const { buildKnowledgeClaimConsolidationPlan } = require("../src/knowledge-consolidation");
const { buildKnowledgeDirtyQueueRunReport, normalizeKnowledgeDirtyQueueBatchSize } = require("../src/knowledge-dirty-queue");
const { buildKnowledgeClaimHygienePlan } = require("../src/knowledge-hygiene");
const { compileKnowledgePages, loadKnowledgeClaimsForCompilation } = require("../src/knowledge-page-compiler");

const DATABASE_URL = String(process.env.DATABASE_URL || "").trim();
const PGSSLMODE = String(process.env.PGSSLMODE || "").trim();
const KNOWLEDGE_DIRTY_QUEUE_BATCH_SIZE = normalizeKnowledgeDirtyQueueBatchSize(
  process.env.KNOWLEDGE_DIRTY_QUEUE_BATCH_SIZE
);

if (!DATABASE_URL) {
  throw new Error("DATABASE_URL is required");
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: PGSSLMODE === "disable" ? false : { rejectUnauthorized: false },
});

async function claimKnowledgeDirtyQueueBatch(client, batchSize) {
  await client.query("BEGIN");

  try {
    const selectResult = await client.query(
      `
        SELECT id, source_type, source_id, affected_scope, affected_scope_id, reason, priority, status, created_at
        FROM knowledge_dirty_queue
        WHERE status = 'pending'
        ORDER BY priority ASC, created_at ASC, id ASC
        LIMIT $1
        FOR UPDATE SKIP LOCKED
      `,
      [batchSize]
    );

    if (selectResult.rowCount === 0) {
      await client.query("COMMIT");
      return [];
    }

    const itemIds = selectResult.rows.map((row) => Number.parseInt(String(row.id), 10));
    await client.query(
      `
        UPDATE knowledge_dirty_queue
        SET status = 'processing',
            locked_at = now()
        WHERE id = ANY($1::bigint[])
      `,
      [itemIds]
    );

    await client.query("COMMIT");
    return selectResult.rows;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

async function loadActiveKnowledgeClaims(client) {
  const claimsResult = await client.query(`
    SELECT id, claim_text, claim_type, scope, scope_id, status, confidence, created_at
    FROM knowledge_claims
    WHERE status IN ('candidate', 'supported', 'disputed')
    ORDER BY created_at DESC, id DESC
    LIMIT 1000
  `);

  const claimIds = claimsResult.rows.map((row) => Number.parseInt(String(row.id), 10)).filter(Number.isInteger);
  if (claimIds.length === 0) {
    return {
      claim_rows: [],
      source_rows: [],
    };
  }

  const sourcesResult = await client.query(
    `
      SELECT id, claim_id, source_type, source_id, support_type, evidence_snippet, created_at
      FROM knowledge_claim_sources
      WHERE claim_id = ANY($1::bigint[])
      ORDER BY created_at ASC, id ASC
    `,
    [claimIds]
  );

  return {
    claim_rows: claimsResult.rows,
    source_rows: sourcesResult.rows,
  };
}

async function applyKnowledgeClaimConsolidation(client, plan) {
  if (!Array.isArray(plan.updates) || plan.updates.length === 0) {
    return 0;
  }

  for (const update of plan.updates) {
    await client.query(
      `
        UPDATE knowledge_claims
        SET status = $2,
            updated_at = now(),
            last_reviewed_at = now()
        WHERE id = $1
      `,
      [update.id, update.next_status]
    );
  }

  return plan.updates.length;
}

async function applyKnowledgeClaimHygiene(client, plan) {
  const archivedByReason = {
    empty_claim: 0,
    inline_markdown_heading: 0,
    markdown_heading: 0,
    structured_fragment: 0,
  };

  if (!Array.isArray(plan.updates) || plan.updates.length === 0) {
    return {
      archived_by_reason: archivedByReason,
      updates_applied: 0,
    };
  }

  for (const update of plan.updates) {
    await client.query(
      `
        UPDATE knowledge_claims
        SET status = $2,
            updated_at = now(),
            last_reviewed_at = now()
        WHERE id = $1
      `,
      [update.id, update.next_status]
    );

    if (Object.prototype.hasOwnProperty.call(archivedByReason, update.hygiene_reason)) {
      archivedByReason[update.hygiene_reason] += 1;
    }
  }

  return {
    archived_by_reason: archivedByReason,
    updates_applied: plan.updates.length,
  };
}

async function markKnowledgeDirtyQueueBatch(client, itemIds, status) {
  if (!Array.isArray(itemIds) || itemIds.length === 0) {
    return;
  }

  await client.query(
    `
      UPDATE knowledge_dirty_queue
      SET status = $2
      WHERE id = ANY($1::bigint[])
    `,
    [itemIds, status]
  );
}

async function main() {
  const claimClient = await pool.connect();
  let queueRows = [];

  try {
    queueRows = await claimKnowledgeDirtyQueueBatch(claimClient, KNOWLEDGE_DIRTY_QUEUE_BATCH_SIZE);
  } finally {
    claimClient.release();
  }

  if (queueRows.length === 0) {
    console.log(
      JSON.stringify({
        event: "knowledge_dirty_queue_noop",
        batch_size: KNOWLEDGE_DIRTY_QUEUE_BATCH_SIZE,
      })
    );
    await pool.end();
    return;
  }

  const itemIds = queueRows.map((row) => Number.parseInt(String(row.id), 10)).filter(Number.isInteger);
  const client = await pool.connect();

  try {
    const { claim_rows: claimRows, source_rows: sourceRows } = await loadActiveKnowledgeClaims(client);
    const consolidationPlan = buildKnowledgeClaimConsolidationPlan(claimRows, sourceRows);

    const refreshedClaimRows = consolidationPlan.updates.length > 0
      ? consolidationPlan.updates.reduce((rows, update) => {
          const row = rows.find((item) => Number(item.id) === Number(update.id));
          if (row) {
            row.status = update.next_status;
          }
          return rows;
        }, [...claimRows])
      : claimRows;
    const hygienePlan = buildKnowledgeClaimHygienePlan(refreshedClaimRows);

    await client.query("BEGIN");
    try {
      const consolidationUpdatesApplied = await applyKnowledgeClaimConsolidation(client, consolidationPlan);
      const hygieneResult = await applyKnowledgeClaimHygiene(client, hygienePlan);
      const pageCompilation = await compileKnowledgePages(client, {
        env: process.env,
        claim_rows: await loadKnowledgeClaimsForCompilation(client),
      });
      await markKnowledgeDirtyQueueBatch(client, itemIds, "completed");
      await client.query("COMMIT");

      console.log(
        JSON.stringify({
          event: "knowledge_dirty_queue_completed",
          batch_size: queueRows.length,
          ...buildKnowledgeDirtyQueueRunReport({
            queue_rows: queueRows,
            consolidation_updates_applied: consolidationUpdatesApplied,
            hygiene_updates_applied: hygieneResult.updates_applied,
            archived_by_reason: hygieneResult.archived_by_reason,
            page_compilation: pageCompilation,
          }),
        })
      );
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  } catch (error) {
    const failClient = await pool.connect();
    try {
      await markKnowledgeDirtyQueueBatch(failClient, itemIds, "failed");
    } finally {
      failClient.release();
    }
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
