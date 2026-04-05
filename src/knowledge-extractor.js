"use strict";

const { buildKnowledgeClaimCandidate, buildKnowledgeDirtyQueueItem } = require("./knowledge-service");
const { normalizeNullableString } = require("./string-normalizers");

const MAX_EXTRACTED_CLAIMS = 3;
const MIN_CLAIM_LENGTH = 30;
const MAX_CLAIM_LENGTH = 280;
const CLAIM_SKIP_PATTERNS = [
  /^что (подтверждено|не подтверждено|остается неясным)/i,
  /^безопасный следующий шаг/i,
  /^следующий шаг/i,
  /^open questions/i,
  /^current task/i,
  /^recent handoffs/i,
  /^memory bundle/i,
];

function normalizeKnowledgeText(value) {
  const normalized = normalizeNullableString(value);
  if (!normalized) {
    return null;
  }

  return normalized
    .replace(/\r/g, "")
    .replace(/^\s*[-*•]\s*/gm, "")
    .replace(/^\s*\d+\.\s*/gm, "")
    .replace(/\*\*/g, "")
    .replace(/`/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function inferKnowledgeClaimType(text) {
  const normalized = normalizeKnowledgeText(text)?.toLowerCase() || "";

  if (/(риск|блокер|блокировка|уязвим|аномал|слабое место|weak point|fragile)/i.test(normalized)) {
    return "risk";
  }
  if (/(предпочита|prefer|предпочтительн|любит формат|предпочтение founder)/i.test(normalized)) {
    return "preference";
  }
  if (/(гипотез|hypothesis|вероятно|возможно|может быть)/i.test(normalized)) {
    return "hypothesis";
  }
  if (/(паттерн|повторя|регулярно|обычно|tends to|repeatedly)/i.test(normalized)) {
    return "pattern";
  }

  return "fact";
}

function shouldKeepClaimText(text) {
  if (!text) {
    return false;
  }
  if (text.length < MIN_CLAIM_LENGTH || text.length > MAX_CLAIM_LENGTH) {
    return false;
  }
  if (text.endsWith("?")) {
    return false;
  }
  return !CLAIM_SKIP_PATTERNS.some((pattern) => pattern.test(text));
}

function extractClaimTexts(text, maxClaims = MAX_EXTRACTED_CLAIMS) {
  const normalized = normalizeKnowledgeText(text);
  if (!normalized) {
    return [];
  }

  const lineCandidates = normalized
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const sentenceCandidates =
    lineCandidates.length > 1
      ? lineCandidates
      : normalized
          .split(/(?<=[.!])\s+/)
          .map((line) => line.trim())
          .filter(Boolean);

  const seen = new Set();
  const claims = [];

  for (const candidate of sentenceCandidates) {
    const clean = normalizeKnowledgeText(candidate);
    if (!clean || !shouldKeepClaimText(clean)) {
      continue;
    }
    const key = clean.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    claims.push(clean);
    if (claims.length >= maxClaims) {
      break;
    }
  }

  return claims;
}

function selectKnowledgeSourceText(result) {
  const artifactReplyText = normalizeKnowledgeText(result?.completion_response?.artifact?.content?.reply_text);
  if (artifactReplyText) {
    return artifactReplyText;
  }

  return normalizeKnowledgeText(result?.reply_text);
}

function buildKnowledgeExtractionPlan(result) {
  const run = result?.run;
  const completedRun = result?.completion_response?.run;

  if (!run || !run.task_id) {
    return null;
  }
  if (completedRun?.status !== "completed") {
    return null;
  }

  const sourceText = selectKnowledgeSourceText(result);
  const claimTexts = extractClaimTexts(sourceText);
  if (claimTexts.length === 0) {
    return null;
  }

  const claimCandidates = claimTexts.map((claimText) =>
    buildKnowledgeClaimCandidate({
      claim_text: claimText,
      claim_type: inferKnowledgeClaimType(claimText),
      scope: "task",
      scope_id: run.task_id,
      confidence: 0.6,
      freshness_score: 1,
    })
  );

  const sourceTemplates = [];
  if (result?.completion_response?.artifact?.id) {
    sourceTemplates.push({
      source_type: "artifact",
      source_id: String(result.completion_response.artifact.id),
      support_type: "derived_from",
    });
  }
  sourceTemplates.push({
    source_type: "run",
    source_id: String(run.id),
    support_type: "derived_from",
  });

  const dirtyQueueItem = buildKnowledgeDirtyQueueItem({
    source_type: result?.completion_response?.artifact?.id ? "artifact" : "run",
    source_id: String(result?.completion_response?.artifact?.id || run.id),
    affected_scope: "task",
    affected_scope_id: run.task_id,
    reason: "task_run_claim_extraction",
    priority: 50,
    status: "pending",
  });

  return {
    run_id: run.id,
    task_id: run.task_id,
    claim_candidates: claimCandidates,
    source_templates: sourceTemplates,
    dirty_queue_item: dirtyQueueItem,
  };
}

module.exports = {
  MAX_EXTRACTED_CLAIMS,
  buildKnowledgeExtractionPlan,
  extractClaimTexts,
  inferKnowledgeClaimType,
  selectKnowledgeSourceText,
};
