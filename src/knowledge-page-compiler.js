"use strict";

const { normalizeLiteLLMConfig } = require("./executor-client");
const { buildKnowledgeScopePageDraftWithFallback, extractJsonObjectFromText, groupKnowledgeClaimsForPages } = require("./knowledge-pages");
const { normalizeNullableString } = require("./string-normalizers");

function normalizeKnowledgePageVersionList(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  const normalized = [];
  for (const item of value) {
    const text = normalizeNullableString(item);
    if (!text) {
      continue;
    }
    normalized.push(text);
  }

  return normalized;
}

function normalizeKnowledgePageVersionSnapshot(version = {}) {
  const source = version && typeof version === "object" ? version : {};
  return {
    summary_short: normalizeNullableString(source.summary_short) ?? null,
    summary_full: normalizeNullableString(source.summary_full) ?? null,
    key_facts_json: normalizeKnowledgePageVersionList(source.key_facts_json),
    contradictions_json: normalizeKnowledgePageVersionList(source.contradictions_json),
    open_questions_json: normalizeKnowledgePageVersionList(source.open_questions_json),
    related_pages_json: normalizeKnowledgePageVersionList(source.related_pages_json),
    compiled_markdown: normalizeNullableString(source.compiled_markdown) ?? null,
  };
}

function isKnowledgePageVersionNoop(currentVersion, nextVersion) {
  const normalizedCurrentVersion = normalizeKnowledgePageVersionSnapshot(currentVersion);
  const normalizedNextVersion = normalizeKnowledgePageVersionSnapshot(nextVersion);

  if (!normalizedCurrentVersion.summary_short || !normalizedCurrentVersion.summary_full) {
    return false;
  }

  return JSON.stringify(normalizedCurrentVersion) === JSON.stringify(normalizedNextVersion);
}

function hasLiteLLMConfig(env = process.env) {
  return Boolean(normalizeNullableString(env.LITELLM_BASE_URL));
}

function normalizeKnowledgeCompilerConfig(env = process.env) {
  if (!hasLiteLLMConfig(env)) {
    return null;
  }

  const liteLLMConfig = normalizeLiteLLMConfig(env);
  const compilerTimeoutMs = Number.parseInt(env.KNOWLEDGE_COMPILER_TIMEOUT_MS || "45000", 10);
  const compilerModel = String(env.KNOWLEDGE_COMPILER_MODEL || "assistant-model").trim();
  return {
    base_url: liteLLMConfig.base_url,
    api_key: liteLLMConfig.api_key,
    timeout_ms:
      Number.isFinite(compilerTimeoutMs) && compilerTimeoutMs > 0
        ? compilerTimeoutMs
        : liteLLMConfig.timeout_ms,
    model: compilerModel,
  };
}

function extractAssistantText(payload) {
  const choice = Array.isArray(payload?.choices) ? payload.choices[0] : null;
  const content = choice?.message?.content;

  if (typeof content === "string") {
    return content.trim() || null;
  }

  if (Array.isArray(content)) {
    const text = content
      .map((part) => {
        if (typeof part === "string") {
          return part;
        }
        if (part && typeof part === "object" && typeof part.text === "string") {
          return part.text;
        }
        return "";
      })
      .join("")
      .trim();

    return text || null;
  }

  return null;
}

function createSemanticCompileGroup(config, fetchImpl = fetch) {
  if (!config) {
    return null;
  }

  return async function compileGroup(input) {
    const abortController = new AbortController();
    const timeout = setTimeout(() => abortController.abort(), config.timeout_ms);

    try {
      const response = await fetchImpl(`${config.base_url}/chat/completions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(config.api_key ? { authorization: `Bearer ${config.api_key}` } : {}),
        },
        body: JSON.stringify({
          model: config.model,
          messages: [
            { role: "system", content: input.system_prompt },
            { role: "user", content: input.user_prompt },
          ],
          max_tokens: 350,
          temperature: 0,
          stream: false,
        }),
        signal: abortController.signal,
      });

      const text = await response.text();
      if (!response.ok) {
        throw new Error(`LiteLLM semantic compile failed: ${response.status} ${text}`);
      }

      const payload = text ? JSON.parse(text) : null;
      const assistantText = extractAssistantText(payload);
      const jsonText = extractJsonObjectFromText(assistantText);
      if (!jsonText) {
        throw new Error("LiteLLM semantic compile returned no JSON payload");
      }

      return JSON.parse(jsonText);
    } finally {
      clearTimeout(timeout);
    }
  };
}

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
    SELECT p.id, p.page_type, p.scope, p.scope_id, p.title, p.status, p.current_version_id,
           v.summary_short, v.summary_full, v.key_facts_json, v.contradictions_json,
           v.open_questions_json, v.related_pages_json, v.compiled_markdown
    FROM knowledge_pages p
    LEFT JOIN knowledge_page_versions v
      ON v.id = p.current_version_id
    WHERE p.page_type = 'scope_summary'
  `);

  const pages = new Map();
  for (const row of result.rows) {
    const key = JSON.stringify([row.page_type, row.scope, row.scope_id ?? null]);
    pages.set(key, {
      ...row,
      current_version: normalizeKnowledgePageVersionSnapshot(row),
    });
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
    existingPages.set(key, {
      ...existing,
      title: draft.title,
      status: draft.status,
    });
    return {
      page_id: Number(existing.id),
      created: false,
      key,
      existing_page: existingPages.get(key),
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
    current_version_id: null,
    current_version: null,
  });

  return {
    page_id: pageId,
    created: true,
    key,
    existing_page: existingPages.get(key),
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

async function compileKnowledgePages(client, options = {}) {
  const claimRows = Array.isArray(options.claim_rows) ? options.claim_rows : await loadKnowledgeClaimsForCompilation(client);
  const groupedClaims = groupKnowledgeClaimsForPages(claimRows);

  if (groupedClaims.length === 0) {
    return {
      grouped_scope_pages: 0,
      pages_created: 0,
      pages_updated: 0,
      versions_created: 0,
      versions_skipped_noop: 0,
      semantic_pages_compiled: 0,
      fallback_pages_compiled: 0,
    };
  }

  const existingPages = await loadExistingKnowledgePages(client);
  const compilerConfig = normalizeKnowledgeCompilerConfig(options.env || process.env);
  const compileGroup = createSemanticCompileGroup(compilerConfig, options.fetchImpl || fetch);

  let pagesCreated = 0;
  let pagesUpdated = 0;
  let versionsCreated = 0;
  let versionsSkippedNoop = 0;
  let semanticPagesCompiled = 0;
  let fallbackPagesCompiled = 0;

  for (const group of groupedClaims) {
    const draft = await buildKnowledgeScopePageDraftWithFallback(group, {
      compileGroup,
    });
    const pageResult = await ensureKnowledgePage(client, existingPages, draft);
    if (pageResult.created) {
      pagesCreated += 1;
    } else {
      pagesUpdated += 1;
    }

    if (draft.version.compiled_by === "knowledge_compiler_semantic_v1") {
      semanticPagesCompiled += 1;
    } else {
      fallbackPagesCompiled += 1;
    }

    if (isKnowledgePageVersionNoop(pageResult.existing_page?.current_version, draft.version)) {
      versionsSkippedNoop += 1;
      continue;
    }

    const versionResult = await insertKnowledgePageVersion(client, pageResult.page_id, draft.version);
    existingPages.set(pageResult.key, {
      ...(existingPages.get(pageResult.key) || {}),
      current_version_id: versionResult.version_id,
      current_version: normalizeKnowledgePageVersionSnapshot(draft.version),
    });
    versionsCreated += 1;
  }

  return {
    grouped_scope_pages: groupedClaims.length,
    pages_created: pagesCreated,
    pages_updated: pagesUpdated,
    versions_created: versionsCreated,
    versions_skipped_noop: versionsSkippedNoop,
    semantic_pages_compiled: semanticPagesCompiled,
    fallback_pages_compiled: fallbackPagesCompiled,
  };
}

module.exports = {
  compileKnowledgePages,
  createSemanticCompileGroup,
  extractAssistantText,
  hasLiteLLMConfig,
  isKnowledgePageVersionNoop,
  loadKnowledgeClaimsForCompilation,
  normalizeKnowledgeCompilerConfig,
  normalizeKnowledgePageVersionSnapshot,
};
