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
6. первый живой vertical slice: Telegram -> worker -> OpenClaw -> ответ в тему;
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
5. есть минимальный Control API для `tasks`.

Следующий практический фокус:
1. Telegram-first routing;
2. создание `thread/task` из Telegram-входа;
3. прямой вызов ролей и путь через `orchestrator`.

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
- [x] Подключить worker к OpenClaw / Antigravity execution path
- [x] Научить worker вызывать `POST /runs/:id/complete`
- [x] Поднять contour на VPS под пользователем `ops` в ручном demo-режиме
- [x] Подключить проект на VPS к живому Railway Postgres через `DATABASE_URL`
- [x] Прогнать живой personal-chat smoke: Telegram message -> run -> stub execution -> complete -> reply
- [x] Перевести demo contour из ручных SSH-сессий в устойчивый systemd-режим
- [x] Прогнать group/topic smoke: сообщение в Telegram-группе -> run -> execution -> complete -> reply in topic
- [ ] Зафиксировать минимальный founder-demo flow: `@assistant` и `@researcher` в живой Telegram-группе

## Phase 6. Scheduled Jobs

- [ ] Добавить registry/use-case для `jobs`
- [ ] Определить, как Railway trigger вызывает VPS execution
- [ ] Реализовать `daily founder brief`
- [ ] Реализовать `weekly digest`
- [ ] Реализовать `competitor watch`
- [ ] Реализовать `branch finance review`
- [ ] Реализовать `weekly risk review`
- [ ] Реализовать `memory cleanup`
- [ ] Прогнать smoke для scheduled trigger -> VPS execution path

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

- [ ] Проверить mobile UX Mini App внутри Telegram
- [ ] Только после этого решить, нужен ли drag & drop
- [ ] Если нужен, сделать drag & drop отдельным шагом
- [ ] Добавить filters / compact view only после базовой стабильности

## Phase 9. Hardening

- [ ] Добавить единый источник истины для списка ролей
- [ ] Убрать дублирование role validation между SQL и API
- [ ] Добавить auth / internal protection layer для Control API
- [ ] Добавить structured logging
- [ ] Добавить smoke-runbook для deploy
- [ ] Добавить Railway/VPS deployment notes в отдельный ops-файл

## Server Validation Gates

- [x] Развернуть contour на VPS под пользователем `ops` в ручном demo-режиме
- [x] Подключить проект к живому Railway Postgres через `DATABASE_URL`
- [x] Перевести VPS contour на systemd services
- [ ] Прогнать полный server smoke suite на VPS
- [x] Проверить process logs после первого живого demo
- [ ] Зафиксировать ручной runbook: `git pull -> migrate -> restart -> smoke`

## Next Step

Следующий шаг по этому чеклисту:
1. зафиксировать минимальный founder-demo flow в живой Telegram-группе для `@assistant` и `@researcher`;
2. затем заменить demo-stub на реальный `CLI-first` OpenClaw execution adapter;
3. после этого вернуться к `Phase 6` scheduled jobs.

