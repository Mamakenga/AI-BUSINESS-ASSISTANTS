"use strict";

const { Pool } = require("pg");
const { buildKnowledgeClaimConsolidationPlan } = require("../src/knowledge-consolidation");

const DATABASE_URL = String(process.env.DATABASE_URL || "").trim();
const PGSSLMODE = String(process.env.PGSSLMODE || "").trim();

if (!DATABASE_URL) {
  throw new Error("DATABASE_URL is required");
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: PGSSLMODE === "disable" ? false : { rejectUnauthorized: false },
});

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
  const statusCounts = {
    supported: 0,
    disputed: 0,
    superseded: 0,
  };

  if (!Array.isArray(plan.updates) || plan.updates.length === 0) {
    return statusCounts;
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

    if (Object.prototype.hasOwnProperty.call(statusCounts, update.next_status)) {
      statusCounts[update.next_status] += 1;
    }
  }

  return statusCounts;
}

async function main() {
  const client = await pool.connect();

  try {
    const { claim_rows: claimRows, source_rows: sourceRows } = await loadActiveKnowledgeClaims(client);
    const plan = buildKnowledgeClaimConsolidationPlan(claimRows, sourceRows);

    if (plan.updates.length === 0) {
      console.log(
        JSON.stringify({
          event: "knowledge_consolidation_noop",
          candidate_count: plan.report.candidate_count,
          grouped_claim_count: plan.grouped_claim_count,
          duplicate_claim_groups: plan.duplicate_claim_groups,
        })
      );
      return;
    }

    await client.query("BEGIN");
    try {
      const statusCounts = await applyKnowledgeClaimConsolidation(client, plan);
      await client.query("COMMIT");

      console.log(
        JSON.stringify({
          event: "knowledge_consolidation_completed",
          updates_applied: plan.updates.length,
          grouped_claim_count: plan.grouped_claim_count,
          duplicate_claim_groups: plan.duplicate_claim_groups,
          supported_count: statusCounts.supported,
          disputed_count: statusCounts.disputed,
          superseded_count: statusCounts.superseded,
          untouched_count: plan.report.untouched_count,
        })
      );
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
