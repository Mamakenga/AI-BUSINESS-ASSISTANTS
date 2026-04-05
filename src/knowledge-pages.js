"use strict";

const { normalizeNullableString } = require("./string-normalizers");

const ALLOWED_KNOWLEDGE_PAGE_TYPES = new Set(["scope_summary"]);
const ALLOWED_KNOWLEDGE_PAGE_STATUSES = new Set(["draft", "active", "stale", "archived"]);
const SUPPORTED_PAGE_CLAIM_STATUSES = new Set(["supported", "disputed"]);
const MAX_PAGE_KEY_FACTS = 5;
const MAX_PAGE_CONTRADICTIONS = 5;
const MAX_PAGE_OPEN_QUESTIONS = 3;
const MAX_SEMANTIC_CLAIMS_PER_STATUS = 8;

function normalizePageScopeId(value) {
  return normalizeNullableString(value) ?? null;
}

function buildKnowledgePageGroupKey(row) {
  return JSON.stringify([
    normalizeNullableString(row.scope) ?? null,
    normalizePageScopeId(row.scope_id),
  ]);
}

function buildKnowledgePageTitle(scope, scopeId) {
  const normalizedScope = normalizeNullableString(scope);
  if (!normalizedScope) {
    throw new Error("scope is required");
  }

  const normalizedScopeId = normalizePageScopeId(scopeId);
  if (!normalizedScopeId) {
    return `${normalizedScope} knowledge summary`;
  }

  return `${normalizedScope} knowledge summary: ${normalizedScopeId}`;
}

function groupKnowledgeClaimsForPages(claimRows = []) {
  const groups = new Map();

  for (const row of claimRows || []) {
    const status = normalizeNullableString(row.status) || "candidate";
    if (!SUPPORTED_PAGE_CLAIM_STATUSES.has(status)) {
      continue;
    }

    const key = buildKnowledgePageGroupKey(row);
    const group =
      groups.get(key) || {
        scope: normalizeNullableString(row.scope),
        scope_id: normalizePageScopeId(row.scope_id),
        claims: [],
      };

    group.claims.push({
      id: Number.parseInt(String(row.id), 10),
      claim_text: normalizeNullableString(row.claim_text),
      status,
      created_at: row.created_at || null,
    });
    groups.set(key, group);
  }

  return Array.from(groups.values()).sort((left, right) => {
    const leftKey = `${left.scope || ""}:${left.scope_id || ""}`;
    const rightKey = `${right.scope || ""}:${right.scope_id || ""}`;
    return leftKey.localeCompare(rightKey);
  });
}

function renderKnowledgePageMarkdown({ title, summaryFull, keyFacts, contradictions }) {
  const sections = [`# ${title}`, "", "## Summary", summaryFull];

  if (keyFacts.length > 0) {
    sections.push("", "## Key Facts", ...keyFacts.map((fact) => `- ${fact}`));
  }

  if (contradictions.length > 0) {
    sections.push("", "## Contradictions", ...contradictions.map((item) => `- ${item}`));
  }

  return sections.join("\n").trim();
}

function normalizePageList(items, maxItems) {
  if (!Array.isArray(items)) {
    return [];
  }

  const normalized = [];
  for (const item of items) {
    const value = normalizeNullableString(item);
    if (!value) {
      continue;
    }

    normalized.push(value);
    if (normalized.length >= maxItems) {
      break;
    }
  }

  return normalized;
}

function buildSemanticKnowledgeCompilerMessages(group) {
  const scope = normalizeNullableString(group?.scope);
  if (!scope) {
    throw new Error("scope is required");
  }

  const scopeId = normalizePageScopeId(group?.scope_id);
  const title = buildKnowledgePageTitle(scope, scopeId);
  const claimRows = Array.isArray(group?.claims) ? group.claims : [];
  const supportedClaims = claimRows
    .filter((row) => row.status === "supported" && normalizeNullableString(row.claim_text))
    .slice(0, MAX_SEMANTIC_CLAIMS_PER_STATUS)
    .map((row) => normalizeNullableString(row.claim_text));
  const disputedClaims = claimRows
    .filter((row) => row.status === "disputed" && normalizeNullableString(row.claim_text))
    .slice(0, MAX_SEMANTIC_CLAIMS_PER_STATUS)
    .map((row) => normalizeNullableString(row.claim_text));

  const systemPrompt = [
    "You compile concise business knowledge pages from validated claims.",
    "Write all summaries, facts, contradictions, and open questions in Russian.",
    "Return only valid JSON.",
    "Do not invent facts beyond the provided claims.",
    "Prefer short, high-signal synthesis.",
    "Schema:",
    '{"summary_short":"string","summary_full":"string","key_facts":["string"],"contradictions":["string"],"open_questions":["string"]}',
  ].join("\n");

  const userPrompt = [
    `Page title: ${title}`,
    `Scope: ${scope}${scopeId ? ` (${scopeId})` : ""}`,
    "",
    "Supported claims:",
    ...(supportedClaims.length > 0 ? supportedClaims.map((claim) => `- ${claim}`) : ["- none"]),
    "",
    "Disputed claims:",
    ...(disputedClaims.length > 0 ? disputedClaims.map((claim) => `- ${claim}`) : ["- none"]),
    "",
    "Task:",
    "1. Write one representative short summary sentence.",
    "2. Write a fuller synthesized summary using only the claims above.",
    "3. Keep up to 5 key facts.",
    "4. Keep up to 5 contradictions.",
    "5. Add up to 3 open questions only if they follow directly from missing or disputed evidence.",
    "6. Write the result in Russian, even if some source claims are in another language.",
    "7. Return JSON only.",
  ].join("\n");

  return {
    title,
    scope,
    scope_id: scopeId,
    supported_claims: supportedClaims,
    disputed_claims: disputedClaims,
    system_prompt: systemPrompt,
    user_prompt: userPrompt,
  };
}

function extractJsonObjectFromText(value) {
  const normalized = normalizeNullableString(value);
  if (!normalized) {
    return null;
  }

  const fencedMatch = normalized.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fencedMatch ? fencedMatch[1].trim() : normalized;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");

  if (start === -1 || end === -1 || end <= start) {
    return null;
  }

  return candidate.slice(start, end + 1);
}

function normalizeSemanticKnowledgeCompilerResult(payload, fallbackDraft) {
  const fallbackVersion = fallbackDraft?.version || {};
  const parsedPayload = typeof payload === "string" ? JSON.parse(payload) : payload;

  if (!parsedPayload || typeof parsedPayload !== "object" || Array.isArray(parsedPayload)) {
    throw new Error("Semantic compiler payload must be an object");
  }

  const summaryShort = normalizeNullableString(parsedPayload.summary_short) || fallbackVersion.summary_short;
  const summaryFull = normalizeNullableString(parsedPayload.summary_full) || fallbackVersion.summary_full;
  const keyFacts = normalizePageList(parsedPayload.key_facts, MAX_PAGE_KEY_FACTS);
  const contradictions = normalizePageList(parsedPayload.contradictions, MAX_PAGE_CONTRADICTIONS);
  const openQuestions = normalizePageList(parsedPayload.open_questions, MAX_PAGE_OPEN_QUESTIONS);

  if (!summaryShort || !summaryFull) {
    throw new Error("Semantic compiler summary is incomplete");
  }

  return {
    ...fallbackDraft,
    version: {
      summary_short: summaryShort,
      summary_full: summaryFull,
      key_facts_json: keyFacts.length > 0 ? keyFacts : fallbackVersion.key_facts_json || [],
      contradictions_json: contradictions.length > 0 ? contradictions : fallbackVersion.contradictions_json || [],
      open_questions_json: openQuestions,
      related_pages_json: fallbackVersion.related_pages_json || [],
      compiled_markdown: renderKnowledgePageMarkdown({
        title: fallbackDraft.title,
        summaryFull,
        keyFacts: keyFacts.length > 0 ? keyFacts : fallbackVersion.key_facts_json || [],
        contradictions: contradictions.length > 0 ? contradictions : fallbackVersion.contradictions_json || [],
      }),
      compiled_by: "knowledge_compiler_semantic_v1",
      change_reason: "compiled_from_supported_claims_semantic",
    },
  };
}

function buildKnowledgeScopePageDraft(group) {
  const scope = normalizeNullableString(group?.scope);
  if (!scope) {
    throw new Error("scope is required");
  }

  const scopeId = normalizePageScopeId(group.scope_id);
  const claimRows = Array.isArray(group.claims) ? group.claims : [];
  if (claimRows.length === 0) {
    throw new Error("claims are required");
  }

  const supportedClaims = claimRows
    .filter((row) => row.status === "supported" && normalizeNullableString(row.claim_text))
    .map((row) => normalizeNullableString(row.claim_text));
  const disputedClaims = claimRows
    .filter((row) => row.status === "disputed" && normalizeNullableString(row.claim_text))
    .map((row) => normalizeNullableString(row.claim_text));

  const title = buildKnowledgePageTitle(scope, scopeId);
  const keyFacts = supportedClaims.slice(0, MAX_PAGE_KEY_FACTS);
  const contradictions = disputedClaims.slice(0, MAX_PAGE_CONTRADICTIONS);
  const summaryShort = keyFacts[0] || contradictions[0] || "No compiled summary is available yet.";
  const summaryFull =
    keyFacts.length > 0
      ? keyFacts.join(" ")
      : contradictions.length > 0
        ? `Contradictions require review: ${contradictions.join(" ")}`
        : "No supported or disputed claims are available yet.";

  return {
    page_type: "scope_summary",
    scope,
    scope_id: scopeId,
    title,
    status: "active",
    version: {
      summary_short: summaryShort,
      summary_full: summaryFull,
      key_facts_json: keyFacts,
      contradictions_json: contradictions,
      open_questions_json: [],
      related_pages_json: [],
      compiled_markdown: renderKnowledgePageMarkdown({
        title,
        summaryFull,
        keyFacts,
        contradictions,
      }),
      compiled_by: "knowledge_compiler",
      change_reason: "compiled_from_supported_claims",
    },
  };
}

async function buildKnowledgeScopePageDraftWithFallback(group, options = {}) {
  const fallbackDraft = buildKnowledgeScopePageDraft(group);
  const compileGroup = typeof options.compileGroup === "function" ? options.compileGroup : null;

  if (!compileGroup) {
    return fallbackDraft;
  }

  try {
    const compilationInput = buildSemanticKnowledgeCompilerMessages(group);
    const result = await compileGroup(compilationInput, fallbackDraft);
    if (!result) {
      return fallbackDraft;
    }

    return normalizeSemanticKnowledgeCompilerResult(result, fallbackDraft);
  } catch (_error) {
    return fallbackDraft;
  }
}

module.exports = {
  ALLOWED_KNOWLEDGE_PAGE_STATUSES,
  ALLOWED_KNOWLEDGE_PAGE_TYPES,
  buildSemanticKnowledgeCompilerMessages,
  buildKnowledgePageTitle,
  buildKnowledgeScopePageDraft,
  buildKnowledgeScopePageDraftWithFallback,
  extractJsonObjectFromText,
  groupKnowledgeClaimsForPages,
  normalizeSemanticKnowledgeCompilerResult,
  renderKnowledgePageMarkdown,
};
