"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");
const { Pool } = require("pg");

const DATABASE_URL = process.env.DATABASE_URL || "";

if (!DATABASE_URL) {
  throw new Error("DATABASE_URL is required");
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: process.env.PGSSLMODE === "disable" ? false : { rejectUnauthorized: false },
});

const MIGRATIONS_DIR = path.join(__dirname, "..", "migrations");

async function ensureSchemaMigrations(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
}

async function getMigrationFiles() {
  const entries = await fs.readdir(MIGRATIONS_DIR, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && /^\d+_.+\.sql$/.test(entry.name))
    .map((entry) => entry.name)
    .sort();
}

async function getAppliedMigrations(client) {
  const result = await client.query("SELECT filename FROM schema_migrations ORDER BY filename ASC");
  return new Set(result.rows.map((row) => row.filename));
}

async function applyMigration(client, filename) {
  const fullPath = path.join(MIGRATIONS_DIR, filename);
  const sql = await fs.readFile(fullPath, "utf8");

  console.log(`Applying ${filename}...`);
  await client.query(sql);
  await client.query("INSERT INTO schema_migrations (filename) VALUES ($1)", [filename]);
  console.log(`Applied ${filename}`);
}

async function main() {
  const client = await pool.connect();
  try {
    await ensureSchemaMigrations(client);
    const files = await getMigrationFiles();
    const applied = await getAppliedMigrations(client);

    let appliedCount = 0;
    for (const filename of files) {
      if (applied.has(filename)) {
        console.log(`Skipping ${filename} (already applied)`);
        continue;
      }

      await applyMigration(client, filename);
      appliedCount += 1;
    }

    if (appliedCount === 0) {
      console.log("No pending migrations");
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
