"use strict";

const { buildExecutionMessages } = require("../src/system-prompts");
const { executeRoleRun } = require("../src/executor-client");

function normalizeOptionalString(value) {
  if (value === undefined || value === null) {
    return null;
  }

  const normalized = String(value).trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeBooleanFlag(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return ["1", "true", "yes", "on"].includes(normalized);
}

function normalizeSimulationConfig(env = process.env) {
  return {
    scenario: normalizeOptionalString(env.SIM_ASSISTANT_SCENARIO || "empty_context") || "empty_context",
    founder_request:
      normalizeOptionalString(env.SIM_ASSISTANT_REQUEST) || "@assistant что у нас сейчас самое срочное?",
    dry_run: normalizeBooleanFlag(env.SIM_DRY_RUN),
    show_prompt: normalizeBooleanFlag(env.SIM_SHOW_PROMPT),
    show_context: normalizeBooleanFlag(env.SIM_SHOW_CONTEXT),
  };
}

function buildRoleContext() {
  return {
    role: {
      id: "assistant",
      execution_mode: "single_role_worker",
      model_alias: "assistant-model",
      output_contract: "assistant_summary_v1",
    },
    run: {
      id: "sim_assistant_01",
      task_id: null,
      thread_id: "sim_thread_01_assistant",
      requested_by_agent: null,
    },
    task: null,
  };
}

function buildSimulationScenarios(founderRequest) {
  return {
    empty_context: {
      ...buildRoleContext(),
      founder_request: founderRequest,
      handoff_messages: [],
      memory_bundle: {
        owner: [{ fact: "Руководитель предпочитает короткие практичные ответы на русском." }],
        business: [],
        role: [],
        task: [],
        decisions: {
          owner: [],
          business: [],
          task: [],
        },
      },
    },
    seeded_ops_focus: {
      ...buildRoleContext(),
      founder_request: founderRequest,
      handoff_messages: [
        {
          id: "handoff_1",
          from_agent: "researcher",
          content: "Свежих подтвержденных сигналов по конкурентам в Варне сейчас нет.",
        },
        {
          id: "handoff_2",
          from_agent: "critic",
          content: "Главный риск сейчас не в transport, а в слабом grounding ответов ассистента при пустом контексте.",
        },
      ],
      memory_bundle: {
        owner: [
          { fact: "Руководитель предпочитает короткие практичные ответы на русском." },
          { fact: "Нужен Telegram-first контур без лишнего технического шума." },
        ],
        business: [
          { fact: "AI_KiberOne чат — основной founder-facing контур." },
          { fact: "LiteLLM, bridge и worker уже живы на VPS." },
        ],
        role: [
          { fact: "Ассистент должен давать лучший доступный ответ и следующий шаг даже при неполном контексте." },
        ],
        task: [],
        decisions: {
          owner: [
            { decision: "Сначала доводим ручные проверки ролей и scheduled jobs, потом идем в hardening." },
          ],
          business: [
            { decision: "Ручной тест assistant сейчас заблокирован слабым grounding при почти пустом контексте." },
            { decision: "Следующий живой manual sweep после assistant — researcher." },
          ],
          task: [],
        },
      },
    },
    seeded_business_leader: {
      ...buildRoleContext(),
      founder_request: founderRequest,
      handoff_messages: [
        {
          id: "handoff_3",
          from_agent: "researcher",
          content: "За последние дни подтвержденных новых сигналов по конкурентам мало, но запросы по Варне и позиционированию остаются актуальными.",
        },
      ],
      memory_bundle: {
        owner: [
          { fact: "Руководитель предпочитает короткие практичные ответы на русском." },
          { fact: "Сначала нужен понятный Telegram-first контур, потом расширение в hardening и дополнительные интерфейсы." },
        ],
        business: [
          { fact: "AI_KiberOne чат остается основным контуром для founder-facing коммуникации." },
          { fact: "Важный текущий вектор — выстроить полезные ответы ролей и scheduled jobs для руководителя." },
          { fact: "Варна и конкурентная ситуация уже фигурировали как часть исследовательских запросов." },
        ],
        role: [
          { fact: "Ассистент должен помогать руководителю быстро понять текущий фокус и следующий безопасный шаг." },
        ],
        task: [],
        decisions: {
          owner: [
            { decision: "Сначала доводим качество ответов ролей, потом идем в hardening." },
          ],
          business: [
            { decision: "Сейчас главный приоритет — превратить живой Telegram-контур в полезный рабочий инструмент для руководителя." },
            { decision: "Если данных для уверенного вывода мало, ассистент должен честно это сказать и предложить ближайший полезный шаг." },
          ],
          task: [],
        },
      },
    },
  };
}

function resolveScenario(config) {
  const scenarios = buildSimulationScenarios(config.founder_request);
  const scenario = scenarios[config.scenario];
  if (!scenario) {
    throw new Error(`Unknown SIM_ASSISTANT_SCENARIO: ${config.scenario}`);
  }

  return {
    scenario_id: config.scenario,
    execution_context: scenario,
  };
}

async function runAssistantSimulation(options = {}) {
  const config = normalizeSimulationConfig(options.env || process.env);
  const resolved = resolveScenario(config);
  const executionContext = resolved.execution_context;
  const executionMessages = buildExecutionMessages(executionContext);

  if (config.show_context) {
    console.log("[simulate-assistant-context] execution context");
    console.log(JSON.stringify(executionContext, null, 2));
  }

  if (config.show_prompt || config.dry_run) {
    console.log("[simulate-assistant-context] system prompt");
    console.log(executionMessages.system_prompt);
    console.log("");
    console.log("[simulate-assistant-context] user prompt");
    console.log(executionMessages.user_prompt);
  }

  if (config.dry_run) {
    console.log(`[simulate-assistant-context] dry run ok for scenario ${resolved.scenario_id}`);
    return {
      scenario_id: resolved.scenario_id,
      execution_context: executionContext,
      execution_messages: executionMessages,
      executor_result: null,
    };
  }

  const executorResult = await executeRoleRun(executionContext, {
    env: options.env || process.env,
    fetchImpl: options.fetchImpl,
  });

  console.log(`[simulate-assistant-context] scenario: ${resolved.scenario_id}`);
  console.log(`[simulate-assistant-context] founder request: ${executionContext.founder_request}`);
  console.log("[simulate-assistant-context] reply");
  console.log(executorResult.reply_text);

  return {
    scenario_id: resolved.scenario_id,
    execution_context: executionContext,
    execution_messages: executionMessages,
    executor_result: executorResult,
  };
}

async function main() {
  await runAssistantSimulation();
}

if (require.main === module) {
  main().catch((error) => {
    console.error("[simulate-assistant-context] failed", error);
    process.exitCode = 1;
  });
}

module.exports = {
  buildSimulationScenarios,
  normalizeSimulationConfig,
  resolveScenario,
  runAssistantSimulation,
};
