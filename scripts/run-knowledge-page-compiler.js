"use strict";

const { Pool } = require("pg");
const { buildKnowledgeScopePageDraft, groupKnowledgeClaimsForPages } = require("../src/knowledge-pages");

const DATABASE_URL = String(process.env.DATABASE_URL || "").trim();
const PGSSLMODE = String(process.env.PGSSLMODE || "").trim();

if (!DATABASE_URL) {
  throw new Error("DATABASE_URL is required");
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: PGSSLMODE === "disable" ? false : { rejectUnauthorized: false },
});

async function loadKnowledgeClaimsForCompilation(client) {
  const result = await client.query(`
    SELECT id, claim_text, scope, scope_id, status, created_at
    FROM knowledge_claims
    WHERE status IN ('supported', 'disputed')
    ORDER BY created_at DESC, id DESC
    LIMIT 1000
  `);

  return result.rows;
}

async function loadExistingKnowledgePages(client) {
  const result = await client.query(`
    SELECT id, page_type, scope, scope_id, title, status, current_version_id
    FROM knowledge_pages
    WHERE page_type = 'scope_summary'
  `);

  const pages = new Map();
  for (const row of result.rows) {
    const key = JSON.stringify([row.page_type, row.scope, row.scope_id ?? null]);
    pages.set(key, row);
  }
  return pages;
}

async function getNextKnowledgePageVersionNo(client, pageId) {
  const result = await client.query(
    `
      SELECT COALESCE(MAX(version_no), 0) AS max_version_no
      FROM knowledge_page_versions
      WHERE page_id = $1
    `,
    [pageId]
  );

  return Number(result.rows[0]?.max_version_no || 0) + 1;
}

async function ensureKnowledgePage(client, existingPages, draft) {
  const key = JSON.stringify([draft.page_type, draft.scope, draft.scope_id ?? null]);
  const existing = existingPages.get(key) || null;

  if (existing) {
    await client.query(
      `
        UPDATE knowledge_pages
        SET title = $2,
            status = $3,
            updated_at = now()
        WHERE id = $1
      `,
      [existing.id, draft.title, draft.status]
    );
    return {
      page_id: Number(existing.id),
      created: false,
    };
  }

  const insertResult = await client.query(
    `
      INSERT INTO knowledge_pages (page_type, scope, scope_id, title, status)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id
    `,
    [draft.page_type, draft.scope, draft.scope_id, draft.title, draft.status]
  );

  const pageId = Number(insertResult.rows[0].id);
  existingPages.set(key, {
    id: pageId,
    page_type: draft.page_type,
    scope: draft.scope,
    scope_id: draft.scope_id,
    title: draft.title,
    status: draft.status,
  });

  return {
    page_id: pageId,
    created: true,
  };
}

async function insertKnowledgePageVersion(client, pageId, version) {
  const versionNo = await getNextKnowledgePageVersionNo(client, pageId);
  const result = await client.query(
    `
      INSERT INTO knowledge_page_versions (
        page_id, version_no, summary_short, summary_full, key_facts_json, contradictions_json,
        open_questions_json, related_pages_json, compiled_markdown, compiled_by, change_reason
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING id, version_no
    `,
    [
      pageId,
      versionNo,
      version.summary_short,
      version.summary_full,
      JSON.stringify(version.key_facts_json),
      JSON.stringify(version.contradictions_json),
      JSON.stringify(version.open_questions_json),
      JSON.stringify(version.related_pages_json),
      version.compiled_markdown,
      version.compiled_by,
      version.change_reason,
    ]
  );

  await client.query(
    `
      UPDATE knowledge_pages
      SET current_version_id = $2,
          updated_at = now()
      WHERE id = $1
    `,
    [pageId, result.rows[0].id]
  );

  return {
    version_id: Number(result.rows[0].id),
    version_no: Number(result.rows[0].version_no),
  };
}

async function main() {
  const client = await pool.connect();

  try {
    const claimRows = await loadKnowledgeClaimsForCompilation(client);
    const groupedClaims = groupKnowledgeClaimsForPages(claimRows);

    if (groupedClaims.length === 0) {
      console.log(
        JSON.stringify({
          event: "knowledge_page_compiler_noop",
          grouped_scope_pages: 0,
        })
      );
      return;
    }

    const existingPages = await loadExistingKnowledgePages(client);

    await client.query("BEGIN");
    try {
      let pagesCreated = 0;
      let pagesUpdated = 0;
      let versionsCreated = 0;

      for (const group of groupedClaims) {
        const draft = buildKnowledgeScopePageDraft(group);
        const pageResult = await ensureKnowledgePage(client, existingPages, draft);
        if (pageResult.created) {
          pagesCreated += 1;
        } else {
          pagesUpdated += 1;
        }

        await insertKnowledgePageVersion(client, pageResult.page_id, draft.version);
        versionsCreated += 1;
      }

      await client.query("COMMIT");

      console.log(
        JSON.stringify({
          event: "knowledge_page_compiler_completed",
          grouped_scope_pages: groupedClaims.length,
          pages_created: pagesCreated,
          pages_updated: pagesUpdated,
          versions_created: versionsCreated,
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
