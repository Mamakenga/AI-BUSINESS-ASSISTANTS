"use strict";

const { Pool } = require("pg");
const { buildKnowledgeClaimHygienePlan } = require("../src/knowledge-hygiene");

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
  const result = await client.query(`
    SELECT id, claim_text, status
    FROM knowledge_claims
    WHERE status IN ('candidate', 'supported', 'disputed')
    ORDER BY created_at DESC, id DESC
    LIMIT 1000
  `);

  return result.rows;
}

async function applyKnowledgeClaimHygiene(client, plan) {
  const archivedByReason = {
    empty_claim: 0,
    inline_markdown_heading: 0,
    markdown_heading: 0,
    structured_fragment: 0,
  };

  if (!Array.isArray(plan.updates) || plan.updates.length === 0) {
    return archivedByReason;
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

  return archivedByReason;
}

async function main() {
  const client = await pool.connect();

  try {
    const claimRows = await loadActiveKnowledgeClaims(client);
    const plan = buildKnowledgeClaimHygienePlan(claimRows);

    if (plan.updates.length === 0) {
      console.log(
        JSON.stringify({
          event: "knowledge_hygiene_noop",
          reviewed_count: plan.report.reviewed_count,
          archived_count: 0,
        })
      );
      return;
    }

    await client.query("BEGIN");
    try {
      const archivedByReason = await applyKnowledgeClaimHygiene(client, plan);
      await client.query("COMMIT");

      console.log(
        JSON.stringify({
          event: "knowledge_hygiene_completed",
          reviewed_count: plan.report.reviewed_count,
          archived_count: plan.updates.length,
          archived_by_reason: archivedByReason,
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
