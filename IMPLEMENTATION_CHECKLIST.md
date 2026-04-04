# Implementation Checklist

Это рабочий чеклист реализации проекта `AI-BUSINESS-ASSISTANTS`.

Он нужен не для архитектурных рассуждений, а для понятного боевого ритма:
1. что уже сделано;
2. что делаем следующим;
3. что пока сознательно отложено.

## Правило порядка

Идём в таком порядке:
1. отдельный проект и инфраструктурный каркас;
2. база данных и control layer;
3. Telegram-first контур;
4. role execution;
5. память;
6. первый живой vertical slice: Telegram -> worker -> LiteLLM -> ответ в тему;
7. scheduled jobs;
8. Mini App board как дополнительный интерфейс;
9. drag & drop и UX-polish только после проверки Telegram-first потока.

Важно:
1. Telegram-группа и ролевой workflow идут раньше Mini App board;
2. первый founder-visible результат важнее scheduled jobs и Mini App;
3. Mini App board не должен подменять собой runtime state model;
4. founder-facing UX не должен перегружаться подкапотными сущностями.

## Current Status

Текущее состояние:
1. есть отдельный репозиторий;
2. есть архитектурный канон;
3. есть deployment skeleton;
4. есть базовая схема БД;
5. есть минимальный Control API для `tasks`;
6. живой LiteLLM-backed `@assistant` и `@researcher` smoke уже прошел на VPS через Telegram supergroup `AI_KiberOne чат`;
7. scheduled trigger -> VPS execution -> Telegram delivery уже прошел живьем;
8. scheduled delivery в тему `01 Assistant` уже подтверждена.
9. manual thin-context sweep для `daily_founder_brief`, `weekly_digest`, `competitor_watch`, `branch_finance_review` и `weekly_risk_review` уже пройден без выдуманных фактов;
10. первый живой dispatch в тему `03 Methodist` уже подтвержден, но quality-signoff для роли пока не пройден.
11. базовый structured logging foundation уже добавлен для `control-api`, `telegram-bridge` и `role-worker`;
12. run-level trace по `run_id` теперь виден от intake до completion/delivery в JSON-логах.

Следующий практический фокус:
1. перейти к `Phase 9` hardening;
2. внутри `Phase 9A` после observability перейти к automated quality gates и затем к следующему hardening pass по founder-facing quality;
3. отдельно вернуться к качеству живого ответа `methodist`;
4. держать `DEPLOY_RUNBOOK.md` как канонический операторский сценарий для VPS updates.
5. считать Phase 6 completed на уровне job contracts and trigger path, а не как полный live-quality signoff для каждого scheduled use-case.
6. зафиксировать founder-facing UX, где implicit routing в родной теме роли станет рекомендуемым live-path без обязательного `@role`, как отдельный future polish после hardening.

## Phase 0. Project Bootstrap

- [x] Создать отдельный репозиторий `AI-BUSINESS-ASSISTANTS`
- [x] Вынести проект из `stemford-ai` в отдельную папку
- [x] Добавить отдельный [START_HERE.md](START_HERE.md)
- [x] Добавить отдельный [OPS_DEPLOYMENT_SKELETON.md](OPS_DEPLOYMENT_SKELETON.md)
- [x] Зафиксировать отдельную канонику планов на русском и английском
- [x] Добавить базовый `.gitignore`

## Phase 1. Data Foundation

- [x] Добавить [001_initial_control_plane.sql](migrations/001_initial_control_plane.sql)
- [x] Создать таблицы `memories`, `messages`, `decisions`, `jobs`, `runs`, `artifacts`
- [x] Добавить базовые индексы под retrieval, inbox и scheduler
- [x] Добавить [002_founder_tasks.sql](migrations/002_founder_tasks.sql)
- [x] Создать таблицу `tasks` для founder-facing task layer
- [x] Связать `messages`, `runs`, `artifacts` с `tasks`
- [x] Добавить migration runner / apply script
- [x] Прогнать миграции на живой Railway Postgres
- [x] Проверить на живой Railway Postgres, что все таблицы и индексы реально созданы

## Phase 2. Control API Foundation

- [x] Добавить `package.json` и базовые зависимости
- [x] Поднять минимальный [src/server.js](src/server.js)
- [x] Реализовать `GET /health`
- [x] Реализовать `GET /tasks`
- [x] Реализовать `GET /tasks/:id`
- [x] Реализовать `POST /tasks`
- [x] Реализовать `PATCH /tasks/:id`
- [x] Добавить `.env.example`
- [ ] Вынести DB/config helpers из `server.js`
- [ ] Добавить endpoints для `messages`
- [ ] Добавить endpoints для `memories`
- [ ] Добавить endpoints для `runs`
- [ ] Добавить endpoints для `artifacts`
- [x] Поднять API локально с реальным `DATABASE_URL`
- [x] Прогнать локальный HTTP smoke для `/health`, `GET /tasks`, `POST /tasks`, `PATCH /tasks/:id`

## Phase 3. Telegram-First Routing

- [x] Зафиксировать Telegram routing spec отдельным файлом
- [x] Описать mapping `topic -> role`
- [x] Поддержать direct role call `@assistant`
- [x] Поддержать direct role call `@researcher`
- [x] Поддержать direct role call `@methodist`
- [x] Поддержать direct role call `@finance`
- [x] Поддержать direct role call `@critic`
- [x] Поддержать `@orchestrator` для multi-role задач
- [x] Научить систему определять роль по Telegram topic без обязательного тега
- [x] Создавать `thread_id` для входящего Telegram-потока
- [x] Создавать `task` из founder-запроса, когда это действительно задача, а не просто вопрос
- [x] Отвечать в ту же тему Telegram без лишнего технического шума
- [x] Прогнать HTTP smoke для `/telegram/route-preview`
- [x] Прогнать HTTP smoke для `/telegram/intake` на direct-answer, one-role task и orchestrator flow

## Phase 4. Role Execution

- [x] Зафиксировать runtime-profile для `orchestrator`
- [x] Зафиксировать runtime-profile для `assistant`
- [x] Зафиксировать runtime-profile для `researcher`
- [x] Зафиксировать runtime-profile для `methodist`
- [x] Зафиксировать runtime-profile для `finance_analyst`
- [x] Зафиксировать runtime-profile для `critic`
- [x] Зафиксировать сервисный режим для `memory_curator`
- [x] Научить `orchestrator` создавать follow-up runs для других ролей
- [x] Сохранять результаты роли в `artifacts`
- [x] Сохранять межролевые handoff-сообщения в `messages`
- [x] Прогнать DB-backed smoke: intake -> follow-up run -> handoff message -> complete -> artifact

## Phase 5. Memory Layer

- [x] Добавить `get_memory`
- [x] Добавить `save_memory_candidate`
- [x] Определить retrieval bundle для `owner`
- [x] Определить retrieval bundle для `business`
- [x] Определить retrieval bundle для `role`
- [x] Определить retrieval bundle для `task`
- [x] Ограничить объём подмешиваемой памяти на run
- [x] Добавить memory compaction flow
- [x] Прогнать DB-backed smoke для `POST /memories/candidates`, `GET /memories`, `POST /memory/bundles/resolve`
- [x] Проверить retrieval bundle на реальных данных для `researcher`, `critic`, `memory_curator`

## Phase 5.5. First Live Vertical Slice

- [x] Реализовать живой Telegram bridge
- [x] Научить bridge вызывать `POST /telegram/intake`
- [x] Научить bridge отправлять founder-facing reply обратно в ту же тему
- [x] Реализовать worker, который забирает pending run и исполняет его
- [x] Подключить worker к LiteLLM execution path
- [x] Научить worker вызывать `POST /runs/:id/complete`
- [x] Поднять contour на VPS под пользователем `ops` в ручном demo-режиме
- [x] Подключить проект на VPS к живому Railway Postgres через `DATABASE_URL`
- [x] Прогнать живой personal-chat smoke: Telegram message -> run -> stub execution -> complete -> reply
- [x] Перевести demo contour из ручных SSH-сессий в устойчивый systemd-режим
- [x] Прогнать group/topic smoke: сообщение в Telegram-группе -> run -> execution -> complete -> reply in topic
- [x] Зафиксировать живой founder-demo flow для `@assistant` в группе `AI_KiberOne чат` через LiteLLM
- [x] Зафиксировать живой founder-demo flow для `@researcher` в группе `AI_KiberOne чат`

## Phase 6. Scheduled Jobs

- [x] Добавить registry/use-case для `jobs`
- [x] Определить, как Railway trigger вызывает VPS execution
- [x] Реализовать `daily founder brief`
- [x] Реализовать `weekly digest`
- [x] Реализовать `competitor watch`
- [x] Реализовать `branch finance review`
- [x] Реализовать `weekly risk review`
- [x] Реализовать `memory cleanup`
- [x] Прогнать smoke для scheduled trigger -> VPS execution path

## Phase 7. Founder Mini App Board

- [ ] Зафиксировать отдельный Mini App frontend spec
- [ ] Добавить task board endpoints, которых не хватает Mini App
- [ ] Поднять простую Mini App страницу на Railway
- [ ] Реализовать колонку `Inbox`
- [ ] Реализовать колонку `In Work`
- [ ] Реализовать колонку `Done`
- [ ] Показать на карточке `title`
- [ ] Показать на карточке `assigned_role`
- [ ] Показать на карточке `priority`
- [ ] Показать на карточке `due_at`
- [ ] Показать на карточке `thread_id`
- [ ] Реализовать move actions вместо drag & drop
- [ ] Не показывать в главной доске `runs`, `fallbacks`, `handoff logs`, `memory internals`

## Phase 8. UX Polish

- [ ] Сделать founder-facing implicit routing в родной теме роли рекомендуемым live UX path без обязательного `@role`
- [ ] Проверить mobile UX Mini App внутри Telegram
- [ ] Только после этого решить, нужен ли drag & drop
- [ ] Если нужен, сделать drag & drop отдельным шагом
- [ ] Добавить filters / compact view only после базовой стабильности

## Phase 9. Hardening

Closure criteria для `Phase 9`:
1. founder-facing runs traceable от intake до delivery;
2. роли и auth-политики имеют один понятный источник истины;
3. quality/safety guards срабатывают автоматически, а не вручную;
4. production contour имеет канонический deploy/rollback/monitoring path.

### Phase 9A. Observability & Runtime Guards
- [ ] Добавить единый источник истины для списка ролей
- [x] Добавить structured logging
- [x] Сделать run-level trace visibility от Telegram intake до delivery
- [x] Сохранять token / usage / cost telemetry per run
- [x] Сделать `fallback_chain` queryable и удобным для ops-debug
- [x] Добавить token / cost boundaries per role с реальным enforcement
- [x] Добавить automated quality gates перед founder-facing delivery
- [x] Расширить sanitization coverage и тесты на leakage внутренних labels / ids / scope tags

### Phase 9B. Registry, Validation & Auth
- [ ] Убрать дублирование role validation между SQL и API
- [ ] Добавить auth / internal protection layer для Control API
- [ ] Закрыть auth coverage для всех внутренних endpoint-ов Control API
- [ ] Зафиксировать policy для rotation / renewal internal tokens

### Phase 9C. Deploy Hardening
- [ ] Добавить smoke-runbook для deploy
- [ ] Добавить Railway/VPS deployment notes в отдельный ops-файл
- [ ] Формализовать smoke -> deploy -> smoke pipeline как канонический deploy path
- [ ] Зафиксировать rollback procedure для VPS deploy
- [ ] Добавить health-check / monitoring notes для ops-контура

## Phase 9.x. Post-Hardening Refactor Backlog

- [ ] Завершить DRY-refactor для normalize/config helpers, которые сейчас дублируются в нескольких файлах
- [ ] Декомпозировать `server.js`, чтобы intake / jobs / memory / runs не жили в одном большом модуле

## Server Validation Gates

- [x] Развернуть contour на VPS под пользователем `ops` в ручном demo-режиме
- [x] Подключить проект к живому Railway Postgres через `DATABASE_URL`
- [x] Перевести VPS contour на systemd services
- [x] Прогнать полный server smoke suite на VPS (`@assistant` and `@researcher` done)
- [x] Проверить process logs после первого живого demo
- [x] Зафиксировать ручной runbook: `git pull -> migrate -> restart -> smoke`

## Next Step

Следующий шаг по этому чеклисту:
1. перейти к `Phase 9` hardening;
2. внутри `Phase 9A` перейти от observability к следующему founder-facing hardening pass после quality gates;
3. после hardening вернуться к live-quality pass для `methodist`;
4. founder-facing implicit same-topic routing без `@role` держать как UX-polish шаг после hardening, а не как недостающую routing-capability;
5. использовать `DEPLOY_RUNBOOK.md` как канонический VPS update flow.

