"use strict";

const { normalizeNullableString } = require("./string-normalizers");

const ALLOWED_KNOWLEDGE_PAGE_TYPES = new Set(["scope_summary"]);
const ALLOWED_KNOWLEDGE_PAGE_STATUSES = new Set(["draft", "active", "stale", "archived"]);
const SUPPORTED_PAGE_CLAIM_STATUSES = new Set(["supported", "disputed"]);
const MAX_PAGE_KEY_FACTS = 5;
const MAX_PAGE_CONTRADICTIONS = 5;
const MAX_PAGE_OPEN_QUESTIONS = 3;
const MAX_SEMANTIC_CLAIMS_PER_STATUS = 8;
const BUSINESS_OPEN_QUESTION_HINTS = [
  "не подтверж",
  "пока не подтверж",
  "не зафиксир",
  "не принят",
  "не определ",
  "не выбран",
  "нужна провер",
  "нужно провер",
  "mystery shopping",
];
const BUSINESS_PRIORITY_KEYWORDS = [
  { pattern: "школ", weight: 6 },
  { pattern: "офлайн", weight: 5 },
  { pattern: "болгари", weight: 3 },
  { pattern: "франшиз", weight: 6 },
  { pattern: "kiberone", weight: 5 },
  { pattern: "филиал", weight: 5 },
  { pattern: "ученик", weight: 5 },
  { pattern: "премиаль", weight: 4 },
  { pattern: "цена", weight: 2 },
  { pattern: "репозиционир", weight: 6 },
  { pattern: "ребренд", weight: 5 },
  { pattern: "модернизац", weight: 4 },
  { pattern: "приоритет", weight: 5 },
  { pattern: "концепц", weight: 4 },
  { pattern: "цифров", weight: 3 },
  { pattern: "инженер", weight: 3 },
  { pattern: "три столп", weight: 3 },
  { pattern: "рамк", weight: 2 },
];

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

function renderKnowledgePageMarkdown({ title, summaryFull, keyFacts, contradictions, openQuestions = [] }) {
  const sections = [`# ${title}`, "", "## Summary", summaryFull];

  if (keyFacts.length > 0) {
    sections.push("", "## Key Facts", ...keyFacts.map((fact) => `- ${fact}`));
  }

  if (contradictions.length > 0) {
    sections.push("", "## Contradictions", ...contradictions.map((item) => `- ${item}`));
  }

  if (openQuestions.length > 0) {
    sections.push("", "## Open Questions", ...openQuestions.map((item) => `- ${item}`));
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

function isBusinessOpenQuestionCandidate(claimText) {
  const normalized = normalizeNullableString(claimText)?.toLowerCase() || "";
  if (!normalized) {
    return false;
  }

  return BUSINESS_OPEN_QUESTION_HINTS.some((hint) => normalized.includes(hint));
}

function scoreBusinessClaimPriority(claimText) {
  const normalized = normalizeNullableString(claimText)?.toLowerCase() || "";
  if (!normalized) {
    return Number.NEGATIVE_INFINITY;
  }

  let score = 0;
  for (const keyword of BUSINESS_PRIORITY_KEYWORDS) {
    if (normalized.includes(keyword.pattern)) {
      score += keyword.weight;
    }
  }

  if (isBusinessOpenQuestionCandidate(normalized)) {
    score -= 20;
  }

  return score;
}

function prioritizeClaimsForScope(scope, claims = []) {
  const normalizedScope = normalizeNullableString(scope);
  const normalizedClaims = claims.filter((claim) => normalizeNullableString(claim));
  if (normalizedScope !== "business") {
    return normalizedClaims;
  }

  return normalizedClaims
    .map((claim, index) => ({
      claim,
      index,
      score: scoreBusinessClaimPriority(claim),
    }))
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .map((item) => item.claim);
}

function buildOpenQuestionsFromSupportedClaims(scope, supportedClaims = []) {
  if (normalizeNullableString(scope) !== "business") {
    return [];
  }

  return prioritizeClaimsForScope(scope, supportedClaims)
    .filter((claim) => isBusinessOpenQuestionCandidate(claim))
    .slice(0, MAX_PAGE_OPEN_QUESTIONS);
}

function buildKeyFactsFromSupportedClaims(scope, supportedClaims = []) {
  const openQuestions = new Set(buildOpenQuestionsFromSupportedClaims(scope, supportedClaims));
  const prioritizedClaims = prioritizeClaimsForScope(scope, supportedClaims).filter((claim) => !openQuestions.has(claim));

  if (prioritizedClaims.length > 0) {
    return prioritizedClaims.slice(0, MAX_PAGE_KEY_FACTS);
  }

  return prioritizeClaimsForScope(scope, supportedClaims).slice(0, MAX_PAGE_KEY_FACTS);
}

function buildSemanticKnowledgeCompilerMessages(group) {
  const scope = normalizeNullableString(group?.scope);
  if (!scope) {
    throw new Error("scope is required");
  }

  const scopeId = normalizePageScopeId(group?.scope_id);
  const title = buildKnowledgePageTitle(scope, scopeId);
  const claimRows = Array.isArray(group?.claims) ? group.claims : [];
  const supportedClaims = prioritizeClaimsForScope(
    scope,
    claimRows
      .filter((row) => row.status === "supported" && normalizeNullableString(row.claim_text))
      .slice(0, MAX_SEMANTIC_CLAIMS_PER_STATUS)
      .map((row) => normalizeNullableString(row.claim_text))
  );
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
    ...(scope === "business"
      ? ["8. For business pages, lead with the core business state, scale, priorities, and strategic direction before secondary research gaps."]
      : []),
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
        openQuestions,
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
  const keyFacts = buildKeyFactsFromSupportedClaims(scope, supportedClaims);
  const contradictions = disputedClaims.slice(0, MAX_PAGE_CONTRADICTIONS);
  const openQuestions = buildOpenQuestionsFromSupportedClaims(scope, supportedClaims);
  const summaryShort = keyFacts[0] || contradictions[0] || "No compiled summary is available yet.";
  const summaryParts = [];
  if (keyFacts.length > 0) {
    summaryParts.push(keyFacts.join(" "));
  } else if (contradictions.length > 0) {
    summaryParts.push(`Contradictions require review: ${contradictions.join(" ")}`);
  }
  if (openQuestions.length > 0) {
    summaryParts.push(`Open questions: ${openQuestions.join(" ")}`);
  }
  const summaryFull = summaryParts.join(" ").trim() || "No supported or disputed claims are available yet.";

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
      open_questions_json: openQuestions,
      related_pages_json: [],
      compiled_markdown: renderKnowledgePageMarkdown({
        title,
        summaryFull,
        keyFacts,
        contradictions,
        openQuestions,
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
