# Runtime Profiles

Этот файл фиксирует runtime-profile ролей для `AI-BUSINESS-ASSISTANTS`.

Он нужен, чтобы:
1. не держать роли и их routing в нескольких несвязанных местах;
2. понимать, какая роль для чего существует;
3. понимать, какой модельный маршрут и memory scope у каждой роли;
4. видеть явный `model_alias`, через который worker ходит в LiteLLM gateway;
5. иметь понятную точку опоры перед Phase 4 execution logic.

Кодовый источник истины:
1. [src/runtime-profiles.js](src/runtime-profiles.js)

## Роли

### orchestrator

1. Режим: `multi_role_router`
2. Telegram:
   - alias: `@orchestrator`
   - topic: `00 Orchestrator`
3. Модельный приоритет:
   - `claude -> gpt -> gemini`
4. LiteLLM alias:
   - `orchestrator-model`
5. Memory scopes:
   - `owner`
   - `business`
   - `task`
   - `decisions`
6. Output contract:
   - `orchestrator_summary_v1`

### assistant

1. Режим: `single_role_worker`
2. Telegram:
   - alias: `@assistant`
   - topic: `01 Assistant`
3. Модельный приоритет:
   - `gpt -> claude -> gemini`
4. LiteLLM alias:
   - `assistant-model`
5. Memory scopes:
   - `owner`
   - `business`
   - `role`
   - `task`
   - `decisions`
6. Output contract:
   - `assistant_summary_v1`

### researcher

1. Режим: `single_role_worker`
2. Telegram:
   - alias: `@researcher`
   - topic: `02 Researcher`
3. Модельный приоритет:
   - `gemini -> claude -> gpt`
4. LiteLLM alias:
   - `researcher-model`
5. Memory scopes:
   - `owner`
   - `business`
   - `role`
   - `task`
6. Output contract:
   - `research_summary_v1`

### methodist

1. Режим: `single_role_worker`
2. Telegram:
   - alias: `@methodist`
   - topic: `03 Methodist`
3. Модельный приоритет:
   - `claude -> gpt -> gemini`
4. LiteLLM alias:
   - `methodist-model`
5. Memory scopes:
   - `owner`
   - `business`
   - `role`
   - `task`
   - `decisions`
6. Output contract:
   - `methodist_program_update_v1`

### finance_analyst

1. Режим: `single_role_worker`
2. Telegram:
   - alias: `@finance`
   - topic: `04 Finance`
3. Модельный приоритет:
   - `gpt -> claude -> gemini`
4. LiteLLM alias:
   - `finance-model`
5. Memory scopes:
   - `owner`
   - `business`
   - `role`
   - `task`
   - `decisions`
6. Output contract:
   - `finance_review_v1`

### critic

1. Режим: `review_worker`
2. Telegram:
   - alias: `@critic`
   - topic: `05 Critic`
3. Модельный приоритет:
   - `claude -> gpt -> gemini`
4. LiteLLM alias:
   - `critic-model`
5. Memory scopes:
   - `owner`
   - `business`
   - `task`
   - `decisions`
6. Output contract:
   - `critic_verdict_v1`

### memory_curator

1. Режим: `memory_service`
2. Telegram:
   - founder-facing topic не нужен в MVP
3. Модельный приоритет:
   - `gemini -> gpt -> claude`
4. LiteLLM alias:
   - `memory-curator-model`
5. Memory scopes:
   - `owner`
   - `business`
   - `role`
   - `task`
   - `decisions`
6. Output contract:
   - `memory_compaction_report_v1`

## Принцип

Runtime profile отвечает не на вопрос "что такое роль вообще", а на вопрос:
1. как её запускать;
2. какой у неё execution mode;
3. какие memory scopes ей разрешены;
4. какой модельный маршрут и `model_alias` у неё в LiteLLM gateway;
5. какой тип результата она должна возвращать.
