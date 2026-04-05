"use strict";

const { normalizeNullableString } = require("./string-normalizers");

const ALLOWED_KNOWLEDGE_PAGE_TYPES = new Set(["scope_summary"]);
const ALLOWED_KNOWLEDGE_PAGE_STATUSES = new Set(["draft", "active", "stale", "archived"]);
const SUPPORTED_PAGE_CLAIM_STATUSES = new Set(["supported", "disputed"]);

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
  const keyFacts = supportedClaims.slice(0, 5);
  const contradictions = disputedClaims.slice(0, 5);
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

module.exports = {
  ALLOWED_KNOWLEDGE_PAGE_STATUSES,
  ALLOWED_KNOWLEDGE_PAGE_TYPES,
  buildKnowledgePageTitle,
  buildKnowledgeScopePageDraft,
  groupKnowledgeClaimsForPages,
  renderKnowledgePageMarkdown,
};
