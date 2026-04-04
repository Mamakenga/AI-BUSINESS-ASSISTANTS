"use strict";

function buildRuntimeLimits(maxCompletionTokens, maxTotalTokens, maxResponseCostUsd) {
  return Object.freeze({
    max_completion_tokens: maxCompletionTokens,
    max_total_tokens: maxTotalTokens,
    max_response_cost_usd: maxResponseCostUsd,
  });
}

const ROLE_PROFILES = Object.freeze({
  orchestrator: Object.freeze({
    id: "orchestrator",
    label: "Оркестратор",
    reply_label_dative: "оркестратору",
    telegram_aliases: Object.freeze(["orchestrator"]),
    telegram_topic: "00 Orchestrator",
    founder_entry_mode: "direct_or_topic",
    execution_mode: "multi_role_router",
    preferred_models: Object.freeze(["claude", "gpt", "gemini"]),
    model_alias: "orchestrator-model",
    runtime_limits: buildRuntimeLimits(1200, 4000, 0.03),
    memory_scopes: Object.freeze(["owner", "business", "task", "decisions"]),
    output_contract: "orchestrator_summary_v1",
  }),
  assistant: Object.freeze({
    id: "assistant",
    label: "Ассистент",
    reply_label_dative: "ассистенту",
    telegram_aliases: Object.freeze(["assistant"]),
    telegram_topic: "01 Assistant",
    founder_entry_mode: "direct_or_topic",
    execution_mode: "single_role_worker",
    preferred_models: Object.freeze(["gpt", "claude", "gemini"]),
    model_alias: "assistant-model",
    runtime_limits: buildRuntimeLimits(900, 2500, 0.02),
    memory_scopes: Object.freeze(["owner", "business", "role", "task", "decisions"]),
    output_contract: "assistant_summary_v1",
  }),
  researcher: Object.freeze({
    id: "researcher",
    label: "Ресерчер",
    reply_label_dative: "ресерчеру",
    telegram_aliases: Object.freeze(["researcher"]),
    telegram_topic: "02 Researcher",
    founder_entry_mode: "direct_or_topic",
    execution_mode: "single_role_worker",
    preferred_models: Object.freeze(["gemini", "claude", "gpt"]),
    model_alias: "researcher-model",
    runtime_limits: buildRuntimeLimits(1200, 3500, 0.03),
    memory_scopes: Object.freeze(["owner", "business", "role", "task"]),
    output_contract: "research_summary_v1",
  }),
  methodist: Object.freeze({
    id: "methodist",
    label: "Методист",
    reply_label_dative: "методисту",
    telegram_aliases: Object.freeze(["methodist"]),
    telegram_topic: "03 Methodist",
    founder_entry_mode: "direct_or_topic",
    execution_mode: "single_role_worker",
    preferred_models: Object.freeze(["claude", "gpt", "gemini"]),
    model_alias: "methodist-model",
    runtime_limits: buildRuntimeLimits(1200, 3000, 0.025),
    memory_scopes: Object.freeze(["owner", "business", "role", "task", "decisions"]),
    output_contract: "methodist_program_update_v1",
  }),
  finance_analyst: Object.freeze({
    id: "finance_analyst",
    label: "Финансовый аналитик",
    reply_label_dative: "финансовому аналитику",
    telegram_aliases: Object.freeze(["finance"]),
    telegram_topic: "04 Finance",
    founder_entry_mode: "direct_or_topic",
    execution_mode: "single_role_worker",
    preferred_models: Object.freeze(["gpt", "claude", "gemini"]),
    model_alias: "finance-model",
    runtime_limits: buildRuntimeLimits(900, 2500, 0.02),
    memory_scopes: Object.freeze(["owner", "business", "role", "task", "decisions"]),
    output_contract: "finance_review_v1",
  }),
  critic: Object.freeze({
    id: "critic",
    label: "Критик",
    reply_label_dative: "критику",
    telegram_aliases: Object.freeze(["critic"]),
    telegram_topic: "05 Critic",
    founder_entry_mode: "direct_or_topic",
    execution_mode: "review_worker",
    preferred_models: Object.freeze(["claude", "gpt", "gemini"]),
    model_alias: "critic-model",
    runtime_limits: buildRuntimeLimits(900, 2500, 0.02),
    memory_scopes: Object.freeze(["owner", "business", "task", "decisions"]),
    output_contract: "critic_verdict_v1",
  }),
  memory_curator: Object.freeze({
    id: "memory_curator",
    label: "Куратор памяти",
    reply_label_dative: "куратору памяти",
    telegram_aliases: Object.freeze([]),
    telegram_topic: null,
    founder_entry_mode: "service_only",
    execution_mode: "memory_service",
    preferred_models: Object.freeze(["gemini", "gpt", "claude"]),
    model_alias: "memory-curator-model",
    runtime_limits: buildRuntimeLimits(1000, 3000, 0.02),
    memory_scopes: Object.freeze(["owner", "business", "role", "task", "decisions"]),
    output_contract: "memory_compaction_report_v1",
  }),
});

const ROLE_IDS = Object.freeze(Object.keys(ROLE_PROFILES));
const ALLOWED_TASK_ROLES = new Set(ROLE_IDS);

const ROLE_ALIASES = new Map();
const TOPIC_ROLE_BY_NAME = new Map([["general", "orchestrator"]]);
const ROLE_LABELS_DATIVE = new Map();

for (const roleId of ROLE_IDS) {
  const profile = ROLE_PROFILES[roleId];
  ROLE_LABELS_DATIVE.set(roleId, profile.reply_label_dative);

  for (const alias of profile.telegram_aliases) {
    ROLE_ALIASES.set(alias, roleId);
  }

  if (profile.telegram_topic) {
    TOPIC_ROLE_BY_NAME.set(profile.telegram_topic.trim().toLowerCase(), roleId);
  }
}

module.exports = {
  ALLOWED_TASK_ROLES,
  ROLE_ALIASES,
  ROLE_IDS,
  ROLE_LABELS_DATIVE,
  ROLE_PROFILES,
  TOPIC_ROLE_BY_NAME,
};
