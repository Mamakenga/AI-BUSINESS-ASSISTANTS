# План реализации отдела AI-бизнес-ассистентов (GPT-5.4)

Статус: Draft
Дата: 2026-03-29
Контур: отдельная система для операционки собственного стартапа на базе OpenClaw + Antigravity + Railway + VPS

## 1. Что мы строим

Мы строим отдельный контур AI-бизнес-ассистентов для управления собственным стартапом и тремя филиалами детской IT-школы.

Это не универсальный "умный бот" и не хаотичная толпа агентов. Это аккуратная рабочая система, в которой:

1. есть отдельные роли с понятной ответственностью;
2. у каждой роли свой контекст и своя память;
3. роли могут передавать друг другу результаты через сообщения и артефакты;
4. все состояние хранится вне сессий, чтобы система помнила прошлые решения;
5. фоновые задачи работают по расписанию на VPS;
6. в качестве модельного слоя используется уже существующий OpenClaw-контур с ротацией моделей через Antigravity и ваши действующие подписки.

Цель системы: получить собственный управляемый "отдел" AI-ассистентов без выхода далеко за пределы текущих расходов на подписки.

---

## 2. Главный принцип

Не строить "толпу болтающих агентов".

Строить:

1. одного orchestrator для сложной multi-role работы;
2. несколько узких ролевых ассистентов;
3. слоистую память;
4. handoff через артефакты и inbox-style сообщения;
5. stateless execution для каждой роли.

Это означает:

1. orchestrator видит общую картину, когда задача реально требует нескольких ролей;
2. каждый worker получает компактный пакет контекста;
3. роли не делят между собой один гигантский общий контекст;
4. предпочтительный способ взаимодействия между ролями - асинхронная mailbox-модель, а не общий чат в реальном времени;
5. долговременная автономность живет в scheduler плюс execution layer, а не в бесконечных сессиях.

---

## 3. Техническая архитектура

### 3.1. VPS

На VPS живет слой исполнения:

1. OpenClaw runtime;
2. Telegram bridge;
3. role workers;
4. исполнение scheduled jobs после trigger-а;
5. process-level логи;
6. временные рабочие артефакты.

### 3.2. Railway

Railway используется как слой памяти, control API и schedule-trigger логики:

1. PostgreSQL;
2. легкий control API;
3. правила чтения и записи памяти;
4. jobs registry и scheduling state;
5. cron-style scheduled triggers;
6. owner inbox / dashboard позже.

### 3.3. Разделение ответственности

Предпочтительное разделение такое:

1. Railway решает, когда scheduled job должен стартовать;
2. VPS решает, как именно job исполняется через OpenClaw;
3. Railway остается source of truth для memory, messages, decisions, runs и artifact metadata;
4. VPS остается слоем runtime execution и process-level logging.

### 3.4. OpenClaw + Antigravity

Этот слой используется как runtime и роутер по моделям:

1. каждая роль имеет preferred model order;
2. при исчерпании лимита идет fallback на следующую модель;
3. используются уже существующие подписки и доступный OAuth-контур;
4. отдельный дорогой API-стек не вводится, если он не нужен.

### 3.4. Telegram как главный интерфейс

Основной вход остается простым:

1. вы пишете в Telegram;
2. система маршрутизирует сообщение либо сразу в нужную роль, либо через orchestrator;
3. ответ возвращается туда же.

---

## 4. Роли стартового состава

Стартуем с семи ролей.

### 4.1. orchestrator

Главный координатор системы.

Что делает:

1. принимает сложные запросы;
2. решает, какую роль подключать;
3. разбивает multi-step задачу на подзадачи;
4. собирает результаты нескольких ролей;
5. возвращает вам итоговый ответ.

Важное правило работы:

1. orchestrator не обязателен для каждого сообщения;
2. простые одношаговые запросы можно адресовать сразу `assistant`, `researcher`, `methodist`, `finance_analyst` или `critic`;
3. orchestrator становится основным путем, когда задача сложная, неочевидная или требует нескольких ролей.

### 4.2. assistant

Секретарь-ассистент для рутинных задач.

Что делает:

1. помогает с ежедневной операционкой;
2. готовит daily и weekly digest;
3. напоминает про хвосты и follow-up;
4. помогает с короткими организационными сообщениями и черновиками.

### 4.3. researcher

Роль внешнего радара.

Что делает:

1. исследует рынок;
2. следит за конкурентами;
3. собирает внешние сигналы;
4. готовит research summary с источниками;
5. может работать в scheduled competitor-watch режиме.

### 4.4. methodist

Профиль под образовательный продукт.

Что делает:

1. помогает создавать и обновлять учебные программы;
2. предлагает изменения в занятиях и треках;
3. адаптирует материалы под возрастные группы;
4. помогает формировать новые образовательные продукты;
5. поддерживает методическую логику школы.

### 4.5. finance_analyst

Финансовый аналитик.

Что делает:

1. анализирует выручку и расходы;
2. сравнивает филиалы по цифрам;
3. замечает финансовые отклонения;
4. помогает оценивать управленческие решения в деньгах;
5. подсвечивает риски и слабые места.

### 4.6. critic

Критик.

Что делает:

1. проверяет чувствительные результаты других ролей;
2. ищет слабые допущения и слишком уверенные выводы;
3. готовит короткие risk memo и contradiction check;
4. выступает формальным skeptical pass перед важными решениями.

Важное правило работы:

1. critic должен видеть owner + business + task context, но не опираться на богатую role memory других ролей;
2. critic - это reviewer, а не второй генератор всего решения заново.

### 4.7. memory_curator

Сервисная роль по памяти.

Что делает:

1. очищает память;
2. сжимает повторяющийся контекст;
3. переносит важные факты в long-term;
4. фиксирует устойчивые решения и выводы;
5. не дает памяти превращаться в мусор.

Эта роль должна в основном работать фоном, а не через постоянный прямой диалог с вами.

Позже, если действительно понадобится, можно добавить новые роли. Но не в MVP.

---

## 5. Routing моделей через Antigravity

Нужен role-based routing, а не один общий default.

Стартовый порядок такой.

### 5.1. orchestrator

1. Claude
2. GPT
3. Gemini

### 5.2. assistant

1. GPT
2. Claude
3. Gemini

### 5.3. researcher

1. Gemini
2. Claude
3. GPT

### 5.4. methodist

1. Claude
2. GPT
3. Gemini

### 5.5. finance_analyst

1. GPT
2. Claude
3. Gemini

### 5.6. critic

1. Claude
2. GPT
3. Gemini

### 5.7. memory_curator

1. Gemini
2. GPT
3. Claude

Правило:

1. router выбирает preferred model;
2. если лимит текущего route исчерпан, идет fallback;
3. каждый fallback логируется в run record.

---

## 6. Дизайн памяти

Память должна быть слоистой.

Нельзя делать одну огромную память на всех.

### 6.1. Слои памяти

#### owner memory

Что система знает о вас:

1. стиль общения;
2. формат предпочтительных ответов;
3. ваши приоритеты;
4. границы допустимой автономии;
5. recurring preferences.

Видна:

1. всем ролям.

#### business memory

Что система знает о бизнесе:

1. структура школы;
2. три филиала;
3. цены;
4. продуктовые направления;
5. текущее позиционирование;
6. важные бизнес-решения;
7. история изменений.

Видна:

1. всем ролям.

#### role memory

Что важно для конкретной роли:

1. recurring patterns;
2. локальные playbooks;
3. повторяющиеся удачные и неудачные практики;
4. role-specific heuristics.

Видна:

1. только этой роли.

#### task memory

Локальная память для конкретной задачи:

1. что уже обсуждалось;
2. какие были промежуточные результаты;
3. какие решения уже приняты;
4. что еще открыто.

Видна:

1. только участникам этой задачи.

### 6.2. Политика записи памяти

Не каждое сообщение попадает в long-term memory.

Поднимать стоит только:

1. устойчивые факты;
2. утвержденные решения;
3. повторяющиеся паттерны;
4. важные предпочтения;
5. проверенные выводы.

### 6.3. Memory compaction

У памяти должны быть три состояния:

1. raw note;
2. compressed summary;
3. long-term fact.

Отдельная scheduled job должна регулярно сжимать и очищать память.

---

## 7. Минимальная схема данных

Трех таблиц мало для реальной работы.

Нужен минимум такой набор.

### 7.1. memories

```sql
CREATE TABLE memories (
  id BIGSERIAL PRIMARY KEY,
  scope TEXT NOT NULL,
  scope_id TEXT,
  fact TEXT NOT NULL,
  source TEXT,
  confidence NUMERIC(4,3),
  tags JSONB DEFAULT '[]'::jsonb,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### 7.2. messages

```sql
CREATE TABLE messages (
  id BIGSERIAL PRIMARY KEY,
  thread_id TEXT NOT NULL,
  task_id TEXT,
  from_agent TEXT NOT NULL,
  to_agent TEXT NOT NULL,
  message_type TEXT NOT NULL DEFAULT 'handoff',
  content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'unread',
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### 7.3. decisions

```sql
CREATE TABLE decisions (
  id BIGSERIAL PRIMARY KEY,
  scope TEXT NOT NULL DEFAULT 'business',
  decision TEXT NOT NULL,
  reasoning TEXT,
  made_by TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### 7.4. jobs

```sql
CREATE TABLE jobs (
  id BIGSERIAL PRIMARY KEY,
  job_type TEXT NOT NULL,
  assigned_agent TEXT NOT NULL,
  schedule TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  last_run_at TIMESTAMPTZ,
  next_run_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### 7.5. runs

```sql
CREATE TABLE runs (
  id BIGSERIAL PRIMARY KEY,
  agent TEXT NOT NULL,
  task_id TEXT,
  thread_id TEXT,
  status TEXT NOT NULL,
  model_used TEXT,
  fallback_chain JSONB DEFAULT '[]'::jsonb,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### 7.6. artifacts

```sql
CREATE TABLE artifacts (
  id BIGSERIAL PRIMARY KEY,
  task_id TEXT NOT NULL,
  artifact_type TEXT NOT NULL,
  created_by TEXT NOT NULL,
  content JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

---

## 8. Tooling layer

Нужно добавить tools в OpenClaw / control API.

Минимальный набор:

1. `get_memory`
2. `save_memory_candidate`
3. `read_messages`
4. `send_message`
5. `save_decision`
6. `create_artifact`
7. `read_artifacts`
8. `create_run_log`

Важное правило:

1. retrieval вызывается wrapper-слоем автоматически;
2. нельзя полагаться на то, что роль сама не забудет подтянуть память;
3. роли могут читать `decisions`, но запись решений должна оставаться под контролем founder-а или явно авторизованного founder-controlled flow.

---

## 9. Execution pattern

### 9.1. Founder request flow

1. founder пишет в Telegram;
2. если он прямо адресует роль для простой one-role задачи, система ведет запрос сразу в эту роль;
3. иначе orchestrator классифицирует запрос;
4. orchestrator решает, это:
   - direct answer;
   - one-role task;
   - multi-role task;
5. система создает `thread` и `run` record;
6. собирается relevant memory bundle;
7. выбранная роль выполняет работу;
8. результат сохраняется как artifact;
9. при необходимости запускаются follow-up runs для `assistant`, `researcher`, `methodist`, `finance_analyst` или `critic`;
10. если в задаче участвовала orchestration-логика, итог founder-у возвращает orchestrator.

### 9.2. Inter-agent flow

Роли не должны разговаривать в формате free-for-all chat.

Они взаимодействуют через:

1. inbox messages для коротких async notes и handoff-сигналов;
2. artifacts для переиспользуемых structured outputs;
3. approved decisions.

Пример:

1. researcher создает research artifact;
2. methodist или finance_analyst читает этот artifact, если он релевантен;
3. assistant готовит executive summary или follow-up packet;
4. orchestrator собирает итог.

---

## 10. Scheduled jobs

На старте достаточно шести фоновых задач.

### 10.1. daily founder brief

Расписание:

1. каждое утро.

Исполнитель:

1. `assistant`.

Результат:

1. короткий Telegram digest.

### 10.2. weekly digest

Расписание:

1. понедельник утром.

Исполнитель:

1. `assistant`.

Результат:

1. решения;
2. риски;
3. незакрытые вопросы.

### 10.3. competitor watch

Расписание:

1. ежедневно.

Исполнитель:

1. `researcher`.

Результат:

1. важные рыночные изменения;
2. обновления памяти;
3. сообщения в `assistant`, `methodist` или `finance_analyst`, если это релевантно.

### 10.4. branch finance review

Расписание:

1. вечер пятницы.

Исполнитель:

1. `finance_analyst`.

Результат:

1. branch-level anomalies;
2. risky trends in numbers;
3. короткие рекомендации или вопросы founder-у.

### 10.5. weekly risk review

Расписание:

1. вечер пятницы после finance review.

Исполнитель:

1. `critic`.

Результат:

1. contradiction check по активным решениям;
2. короткий список слабых допущений;
3. escalation note для founder-а, если предложение выглядит хрупким.

### 10.6. memory cleanup

Расписание:

1. два раза в неделю.

Исполнитель:

1. `memory_curator`.

Результат:

1. compacted memory;
2. поднятые long-term facts.

---

## 11. Правила изоляции контекста

Это не обсуждается.

1. каждый run stateless;
2. role memory изолирована;
3. каждая роль видит только минимально нужный memory bundle;
4. сообщения обязаны иметь `thread_id`;
5. артефакты обязаны иметь `task_id`;
6. decisions - это founder-approved facts и read-only для обычного role execution;
7. никакого общего глобального role chat;
8. никакого бесконтрольного переноса длинного сессионного контекста.

---

## 12. UX-модель

Founder interface должен оставаться простым.

Основной интерфейс - Telegram.

### 12.1. Telegram-группа с темами

Предпочтительный UX - одна Telegram-группа с включенными Topics.

Рекомендуемая структура тем:

1. `00 Orchestrator`
2. `01 Assistant`
3. `02 Researcher`
4. `03 Methodist`
5. `04 Finance`
6. `05 Critic`

`memory_curator` по умолчанию остается внутренней сервисной ролью и не требует отдельной пользовательской темы в MVP.

### 12.2. Routing внутри группы

Правила маршрутизации:

1. если founder пишет в теме роли, сообщение уходит этой роли;
2. если founder явно тегает роль, тег имеет приоритет над темой;
3. если founder пишет в `00 Orchestrator`, orchestrator может вызвать несколько ролей;
4. простые one-role задачи можно слать напрямую в `@assistant`, `@researcher`, `@methodist`, `@finance` или `@critic`;
5. внутренняя координация между ролями должна жить в backend message/artifact layer, а не в шумном публичном Telegram-потоке.

### 12.3. Founder UX

Ожидаемый опыт founder-а:

1. для простых задач - писать нужной роли напрямую;
2. для сложных задач - писать orchestrator;
3. нужная роль работает с компактным контекстом;
4. результат возвращается в чистом понятном формате.

Позже можно добавить:

1. легкий Railway dashboard;
2. inbox scheduled outputs;
3. memory review screen;
4. job status screen.

---

### 12.4. Founder Mini App Kanban

Telegram Mini App kanban-доска рекомендуется как founder-facing control surface.

Ее надо понимать как:

1. чистую визуальную доску для founder-задач и работы ассистентов, которую полезно видеть человеку;
2. Mini App, который хостится на Railway рядом с control API;
3. UI-слой поверх канонического backend state, а не замену для runs, messages или artifacts.

Эта доска не должна становиться единственным system of record для runtime execution.

Предпочтительная схема такая:

1. founder нажимает кнопку в Telegram и открывает Mini App внутри Telegram;
2. Mini App читает и пишет board state через control API;
3. PostgreSQL остается source of truth;
4. role runs, messages, artifacts и memory продолжают жить в своих таблицах.

Для founder board нужен отдельный task-слой, например с такими полями:

1. `id`;
2. `title`;
3. `status`;
4. `assigned_role`;
5. `thread_id`;
6. `priority`;
7. `due_at`;
8. `board_order`;
9. `created_at`;
10. `updated_at`.

Рекомендуемые статусы:

1. `inbox`;
2. `in_work`;
3. `done`.

Важное правило:

1. Mini App board нужен для founder visibility и легкого контроля;
2. базовый поток колонок - `Inbox -> In Work -> Done`, с возможностью расширить статусную модель позже, если это действительно понадобится;
3. он не заменяет более глубокую runtime state model;
4. интерфейс должен оставаться визуально простым и не показывать в главной доске подкапотные сущности вроде raw runs, fallback chains, внутренних handoff logs или memory mechanics;
5. drag-and-drop можно добавить позже, но первую версию безопаснее делать через стабильные move actions, если mobile UX внутри Telegram окажется капризным.

---

## 13. Пошаговый MVP-план

### Phase 1. Data foundation

1. поднять Railway PostgreSQL;
2. создать 6 таблиц;
3. добавить простые индексы по scope, thread_id, task_id и created_at.

### Phase 2. API foundation

1. собрать маленький control API;
2. открыть read/write endpoints для memory, messages, decisions, artifacts, jobs, runs;
3. добавить agent-safe validation.

### Phase 3. OpenClaw tool layer

1. определить 8 tools;
2. привязать их к существующему assistant contour;
3. убедиться, что retrieval живет в wrapper-е, а не на ручной дисциплине skill-а.

### Phase 4. Role rollout

1. создать 7 role profiles;
2. подключить каждой роли ее Antigravity routing chain;
3. протестировать one-role задачи;
4. протестировать handoff researcher -> assistant -> finance_analyst или methodist;
5. протестировать critic review на одном high-stakes multi-role output.

### Phase 5. Scheduler

1. добавить cron или systemd timers на VPS;
2. стартовать с daily founder brief и competitor watch;
3. добавить weekly critic review;
4. логировать каждый run в `runs`.

### Phase 6. Founder Mini App board

1. добавить founder-facing task table и API endpoints для чтения и обновления доски;
2. поднять простой Telegram Mini App board на Railway с базовым потоком `Inbox -> In Work -> Done`;
3. связать board-задачи с текущими ролями ассистентов, не смешивая их с сырым runtime internals;
4. держать основную доску визуально чистой и founder-oriented, а техническое состояние прятать глубже, если оно вообще понадобится;
5. начать со стабильных move actions; drag-and-drop добавлять только если Telegram mobile UX покажет себя надежно.

### Phase 7. Memory hygiene

1. реализовать memory compaction;
2. ограничить объем retrieval на роль;
3. проверить повторные сессии на дистанции нескольких дней.

---

## 14. Логика бюджета

Целевой бюджет:

1. действующие подписки остаются главным бюджетом на модели;
2. Antigravity routing тратит уже оплаченные лимиты;
3. Railway по возможности остается на free tier;
4. scheduled jobs должны быть короткими и структурированными.

Риск:

1. даже если прямые token costs близки к нулю, большие memory bundles все равно создают latency и давление на квоты.

Поэтому:

1. оптимизируем компактность prompt-ов;
2. оптимизируем summaries, а не raw chat dumps;
3. оптимизируем role isolation.

### 14.1. Человеко-понятное управление бюджетом

Следующий практический слой после runtime limits должен быть не техническим, а founder-friendly.

Цель:

1. дать возможность управлять "щедростью" роли без доступа к серверу и без правки кода;
2. не заставлять пользователя разбираться в токенах, долларах и внутренних лимитах;
3. оставить технические числа под капотом как внутреннюю механику системы.

Пользовательский интерфейс должен быть таким:

1. для каждой founder-visible роли показывается простой режим:
   - `Экономно`
   - `Сбалансированно`
   - `Свободно`
2. при желании можно добавить вторую простую настройку:
   - `Коротко`
   - `Нормально`
   - `Подробно`
3. raw поля вроде `max_completion_tokens`, `max_total_tokens` и `max_response_cost_usd` по умолчанию не показываются.

Как это работает под капотом:

1. в коде остаются безопасные дефолтные limits для каждой роли;
2. в БД появляется таблица override-лимитов по ролям;
3. worker сначала читает override из БД, а если override нет — берет code default;
4. friendly-режим (`Экономно / Сбалансированно / Свободно`) просто маппится на конкретные технические лимиты.

Минимальный технический план реализации:

1. добавить таблицу `role_runtime_limits`:
   - `role_id`
   - `budget_mode`
   - `max_completion_tokens`
   - `max_total_tokens`
   - `max_response_cost_usd`
   - `updated_at`
2. добавить loader merged-лимитов:
   - `db override -> fallback на runtime-profiles.js`
3. добавить Control API:
   - `GET /runtime-limits`
   - `PATCH /runtime-limits/:roleId`
4. вернуть founder-friendly payload:
   - role
   - current mode
   - short explanation of what the mode means
5. только потом, отдельным шагом, добавить UI:
   - простую Mini App / ops-страницу
   - или founder-friendly settings screen

Важные guardrails:

1. default UX должен быть "понятные режимы", а не инженерные цифры;
2. расширенные поля можно показать только в отдельном advanced-view;
3. у каждой смены режима должен быть safe default и понятное описание последствий:
   - дешевле, но короче
   - сбалансировано
   - подробнее, но дороже
4. даже при self-service runtime budget guard в worker остается обязательным и не отключается из UI.

---

## 15. Критерии успеха

Система считается рабочей, когда:

1. founder может либо писать ролям напрямую для простых задач, либо использовать orchestrator для сложных;
2. Telegram topics предсказуемо маршрутизируют работу в нужную роль;
3. как минимум четыре role workers работают стабильно;
4. daily и weekly scheduled outputs приходят автоматически;
5. память переживает сессии;
6. role outputs стабильны и не смешивают контекст;
7. critic умеет проверять чувствительные outputs перед тем, как founder по ним действует;
8. важные решения сохраняются и используются позже.

---

## 16. Финальная рекомендация

Не надо стартовать с огромного "отдела".

Стартовать надо с:

1. `orchestrator`
2. `assistant`
3. `researcher`
4. `methodist`
5. `finance_analyst`
6. `critic`
7. `memory_curator`

И строить систему вокруг:

1. Railway Postgres;
2. OpenClaw на VPS;
3. Antigravity role routing;
4. stateless runs;
5. layered memory;
6. scheduled jobs;
7. artifact-based handoffs.

Это минимальная архитектура, которая закрывает founder use case без лишнего усложнения.


