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
5. память и scheduled jobs;
6. Mini App board как дополнительный интерфейс;
7. drag & drop и UX-polish только после проверки Telegram-first потока.

Важно:
1. Telegram-группа и ролевой workflow идут раньше Mini App board;
2. Mini App board не должен подменять собой runtime state model;
3. founder-facing UX не должен перегружаться подкапотными сущностями.

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
- [ ] Добавить migration runner / apply script
- [ ] Прогнать миграции на живой Railway Postgres

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
- [ ] Отвечать в ту же тему Telegram без лишнего технического шума

## Phase 4. Role Execution

- [ ] Зафиксировать runtime-profile для `orchestrator`
- [ ] Зафиксировать runtime-profile для `assistant`
- [ ] Зафиксировать runtime-profile для `researcher`
- [ ] Зафиксировать runtime-profile для `methodist`
- [ ] Зафиксировать runtime-profile для `finance_analyst`
- [ ] Зафиксировать runtime-profile для `critic`
- [ ] Зафиксировать сервисный режим для `memory_curator`
- [ ] Научить `orchestrator` создавать follow-up runs для других ролей
- [ ] Сохранять результаты роли в `artifacts`
- [ ] Сохранять межролевые handoff-сообщения в `messages`

## Phase 5. Memory Layer

- [ ] Добавить `get_memory`
- [ ] Добавить `save_memory_candidate`
- [ ] Определить retrieval bundle для `owner`
- [ ] Определить retrieval bundle для `business`
- [ ] Определить retrieval bundle для `role`
- [ ] Определить retrieval bundle для `task`
- [ ] Ограничить объём подмешиваемой памяти на run
- [ ] Добавить memory compaction flow

## Phase 6. Scheduled Jobs

- [ ] Добавить registry/use-case для `jobs`
- [ ] Определить, как Railway trigger вызывает VPS execution
- [ ] Реализовать `daily founder brief`
- [ ] Реализовать `weekly digest`
- [ ] Реализовать `competitor watch`
- [ ] Реализовать `branch finance review`
- [ ] Реализовать `weekly risk review`
- [ ] Реализовать `memory cleanup`

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

## Next Step

Следующий шаг по этому чеклисту:
1. сделать Telegram routing spec;
2. затем начать Telegram-first flow;
3. Mini App board пока не трогать как следующий implementation slice.
