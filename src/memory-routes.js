"use strict";

const { buildMemoryBundleRequest, createEmptyBundleResult, trimMemoryBundle } = require("./memory-bundles");
const { buildMemoryCompaction, normalizeSourceMemoryIds } = require("./memory-compaction");
const { buildMemoryCandidate, parseMemoryQuery } = require("./memory-service");

function mapMemoryRow(row) {
  return {
    id: row.id,
    scope: row.scope,
    scope_id: row.scope_id,
    fact: row.fact,
    source: row.source,
    confidence: row.confidence,
    tags: row.tags,
    expires_at: row.expires_at,
    created_at: row.created_at,
  };
}

function mapDecisionRow(row) {
  return {
    id: row.id,
    scope: row.scope,
    decision: row.decision,
    reasoning: row.reasoning,
    made_by: row.made_by,
    status: row.status,
    created_at: row.created_at,
  };
}

function buildDecisionLookup(scope, limit, scopeId = null) {
  const values = [scope];
  const where = ["scope = $1", "status = 'active'"];

  if (scope === "task") {
    if (scopeId === null) {
      return null;
    }

    values.push(scopeId);
    where.push(`scope_id = $${values.length}`);
  } else {
    where.push("scope_id IS NULL");
  }

  values.push(limit);

  return {
    text: `
      SELECT id, scope, decision, reasoning, made_by, status, created_at
      FROM decisions
      WHERE ${where.join(" AND ")}
      ORDER BY created_at DESC
      LIMIT $${values.length}
    `,
    values,
  };
}

function registerMemoryRoutes(app, { pool }) {
  app.get("/memories", async (req, res, next) => {
    try {
      const query = parseMemoryQuery(req.query || {});
      const values = [query.scope];
      const where = ["scope = $1"];

      if (query.scope_id !== null) {
        values.push(query.scope_id);
        where.push(`scope_id = $${values.length}`);
      } else {
        where.push("scope_id IS NULL");
      }

      if (!query.include_expired) {
        where.push("(expires_at IS NULL OR expires_at > now())");
      }

      values.push(query.limit);

      const result = await pool.query(
        `
          SELECT id, scope, scope_id, fact, source, confidence, tags, expires_at, created_at
          FROM memories
          WHERE ${where.join(" AND ")}
          ORDER BY created_at DESC
          LIMIT $${values.length}
        `,
        values
      );

      return res.json({
        items: result.rows.map(mapMemoryRow),
      });
    } catch (error) {
      return next(error);
    }
  });

  app.post("/memories/candidates", async (req, res, next) => {
    try {
      const candidate = buildMemoryCandidate(req.body || {});

      const result = await pool.query(
        `
          INSERT INTO memories (
            scope, scope_id, fact, source, confidence, tags, expires_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          RETURNING id, scope, scope_id, fact, source, confidence, tags, expires_at, created_at
        `,
        [
          candidate.scope,
          candidate.scope_id,
          candidate.fact,
          candidate.source,
          candidate.confidence,
          JSON.stringify(candidate.tags),
          candidate.expires_at,
        ]
      );

      return res.status(201).json(mapMemoryRow(result.rows[0]));
    } catch (error) {
      return next(error);
    }
  });

  app.post("/memories/compactions", async (req, res, next) => {
    const client = await pool.connect();
    try {
      const sourceMemoryIds = normalizeSourceMemoryIds(req.body?.source_memory_ids);
      await client.query("BEGIN");

      const sourceResult = await client.query(
        `
          SELECT id, scope, scope_id, fact, source, confidence, tags, expires_at, created_at
          FROM memories
          WHERE id = ANY($1::bigint[])
          FOR UPDATE
        `,
        [sourceMemoryIds]
      );

      const compaction = buildMemoryCompaction(req.body || {}, sourceResult.rows);

      const archivedSources = [];
      for (const sourceRow of compaction.archived_sources) {
        const archivedResult = await client.query(
          `
            UPDATE memories
            SET
              tags = $2,
              expires_at = $3
            WHERE id = $1
            RETURNING id, scope, scope_id, fact, source, confidence, tags, expires_at, created_at
          `,
          [sourceRow.id, JSON.stringify(sourceRow.tags), sourceRow.expires_at]
        );
        archivedSources.push(mapMemoryRow(archivedResult.rows[0]));
      }

      const summaryResult = await client.query(
        `
          INSERT INTO memories (
            scope, scope_id, fact, source, confidence, tags, expires_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          RETURNING id, scope, scope_id, fact, source, confidence, tags, expires_at, created_at
        `,
        [
          compaction.summary_memory.scope,
          compaction.summary_memory.scope_id,
          compaction.summary_memory.fact,
          compaction.summary_memory.source,
          compaction.summary_memory.confidence,
          JSON.stringify(compaction.summary_memory.tags),
          compaction.summary_memory.expires_at,
        ]
      );

      const promotedMemories = [];
      for (const promotedMemory of compaction.promoted_memories) {
        const promotedResult = await client.query(
          `
            INSERT INTO memories (
              scope, scope_id, fact, source, confidence, tags, expires_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING id, scope, scope_id, fact, source, confidence, tags, expires_at, created_at
          `,
          [
            promotedMemory.scope,
            promotedMemory.scope_id,
            promotedMemory.fact,
            promotedMemory.source,
            promotedMemory.confidence,
            JSON.stringify(promotedMemory.tags),
            promotedMemory.expires_at,
          ]
        );
        promotedMemories.push(mapMemoryRow(promotedResult.rows[0]));
      }

      await client.query("COMMIT");

      return res.status(201).json({
        archived_sources: archivedSources,
        promoted_memories: promotedMemories,
        report: {
          ...compaction.report,
          archived_source_ids: archivedSources.map((item) => item.id),
          promoted_memory_ids: promotedMemories.map((item) => item.id),
          summary_memory_id: summaryResult.rows[0].id,
        },
        summary_memory: mapMemoryRow(summaryResult.rows[0]),
      });
    } catch (error) {
      await client.query("ROLLBACK");
      return next(error);
    } finally {
      client.release();
    }
  });

  app.post("/memory/bundles/resolve", async (req, res, next) => {
    try {
      const bundleRequest = buildMemoryBundleRequest(req.body || {});
      const result = createEmptyBundleResult(bundleRequest);

      async function loadMemories(scope, scopeId) {
        const values = [scope];
        const where = ["scope = $1"];

        if (scopeId === null) {
          where.push("scope_id IS NULL");
        } else {
          values.push(scopeId);
          where.push(`scope_id = $${values.length}`);
        }

        if (!bundleRequest.include_expired) {
          where.push("(expires_at IS NULL OR expires_at > now())");
        }

        values.push(bundleRequest.limit_per_scope);

        const queryResult = await pool.query(
          `
            SELECT id, scope, scope_id, fact, source, confidence, tags, expires_at, created_at
            FROM memories
            WHERE ${where.join(" AND ")}
            ORDER BY created_at DESC
            LIMIT $${values.length}
          `,
          values
        );

        return queryResult.rows.map(mapMemoryRow);
      }

      async function loadDecisions(scope, scopeId = null) {
        const lookup = buildDecisionLookup(scope, bundleRequest.limit_per_scope, scopeId);

        if (!lookup) {
          return [];
        }

        const queryResult = await pool.query(lookup.text, lookup.values);

        return queryResult.rows.map(mapDecisionRow);
      }

      if (bundleRequest.scopes.owner) {
        result.owner = await loadMemories("owner", null);
      }
      if (bundleRequest.scopes.business) {
        result.business = await loadMemories("business", null);
      }
      if (bundleRequest.scopes.role) {
        result.role = await loadMemories("role", bundleRequest.role_id);
      }
      if (bundleRequest.scopes.task && bundleRequest.task_id) {
        result.task = await loadMemories("task", bundleRequest.task_id);
      }
      if (bundleRequest.scopes.decisions) {
        result.decisions.owner = await loadDecisions("owner");
        result.decisions.business = await loadDecisions("business");
        result.decisions.task = await loadDecisions("task", bundleRequest.task_id);
      }

      return res.json(trimMemoryBundle(result, bundleRequest));
    } catch (error) {
      return next(error);
    }
  });
}

module.exports = {
  buildDecisionLookup,
  mapDecisionRow,
  mapMemoryRow,
  registerMemoryRoutes,
};
