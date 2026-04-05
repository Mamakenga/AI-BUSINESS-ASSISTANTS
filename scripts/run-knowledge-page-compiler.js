"use strict";

const { Pool } = require("pg");
const { compileKnowledgePages } = require("../src/knowledge-page-compiler");

const DATABASE_URL = String(process.env.DATABASE_URL || "").trim();
const PGSSLMODE = String(process.env.PGSSLMODE || "").trim();

if (!DATABASE_URL) {
  throw new Error("DATABASE_URL is required");
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: PGSSLMODE === "disable" ? false : { rejectUnauthorized: false },
});

async function main() {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    try {
      const result = await compileKnowledgePages(client, {
        env: process.env,
      });
      await client.query("COMMIT");

      if (result.grouped_scope_pages === 0) {
        console.log(
          JSON.stringify({
            event: "knowledge_page_compiler_noop",
            grouped_scope_pages: 0,
          })
        );
        return;
      }

      console.log(
        JSON.stringify({
          event: "knowledge_page_compiler_completed",
          ...result,
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
