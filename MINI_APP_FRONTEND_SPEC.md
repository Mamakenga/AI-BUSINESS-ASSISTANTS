# Mini App Frontend Spec

Status: Draft
Date: 2026-04-05
Contour: founder-facing Telegram Mini App for `AI-BUSINESS-ASSISTANTS`

## 1. Purpose

The Mini App exists as an additional founder-facing surface on top of the already working Telegram-first contour.

It is not meant to replace Telegram topics and it is not meant to expose runtime internals. The first version exists for three simple outcomes:
1. make the founder task board visible at a glance;
2. allow simple task state changes without touching logs or database views;
3. provide a lightweight visual control surface for `Inbox -> In Work -> Done`.

Core rule:
1. Telegram remains the main working interface;
2. the Mini App remains a secondary visual layer;
3. PostgreSQL plus the Control API remain the source of truth.

## 2. Scope Of Version 1

Version 1 must stay small and safe.

Included:
1. one board page inside Telegram Mini App;
2. three columns:
   - `Inbox`
   - `In Work`
   - `Done`
3. founder-facing task cards;
4. explicit move actions instead of drag and drop;
5. opening from Telegram via button or deep link;
6. reading and updating board state through the Control API.

Not included:
1. runs;
2. fallback chains;
3. internal handoff logs;
4. memory internals;
5. artifact JSON;
6. admin or debug console;
7. complex filters in the first version;
8. drag and drop before a separate mobile check.

## 3. Target User Flow

The founder opens the Mini App inside Telegram and within 10-20 seconds understands:
1. what landed in `Inbox`;
2. what is currently in work;
3. what is already done.

The founder can:
1. open a task card;
2. view the main fields;
3. move the task to another status via an explicit button;
4. return to the related Telegram conversation when needed.

The founder should not need to understand:
1. `run_id`;
2. `thread_id`;
3. memory scopes;
4. artifact types;
5. orchestration internals.

## 4. Information Architecture

### 4.1. Main Screen

The main screen contains:
1. a short header such as `Founder Board`;
2. the three board columns;
3. task cards inside each column;
4. a compact footer or state line only if it adds real value.

### 4.2. Task Card

Version 1 cards should show:
1. `title`;
2. `assigned_role`;
3. `priority`;
4. `due_at`.

Allowed extras:
1. a short human-readable status label;
2. a role badge;
3. an overdue state if the due date has passed.

Do not show on the main card by default:
1. `thread_id`;
2. `task_id`;
3. `board_order`;
4. raw timestamps;
5. any internal identifiers.

### 4.3. Detail View

If a detail view exists, it must still stay founder-facing.

Allowed fields:
1. full `title`;
2. status;
3. role;
4. priority;
5. due date;
6. a button that returns the founder to Telegram.

Still avoid by default:
1. raw message logs;
2. raw artifacts;
3. memory data;
4. fallback or debug telemetry.

## 5. UX Rules

### 5.1. Mobile First

The Mini App must be designed for Telegram mobile first.

Rules:
1. one column per screen or a horizontally swipable board;
2. large tappable controls;
3. minimal small text;
4. no overloaded table layout in version 1.

### 5.2. Move Actions

Version 1 changes status through explicit buttons:
1. `Move to Inbox`
2. `Move to In Work`
3. `Move to Done`

Why:
1. Telegram Mini App mobile UX can be unreliable with drag and drop;
2. buttons are easier to test;
3. buttons are safer for founder-facing reliability.

### 5.3. Visual Direction

The interface should feel:
1. calm;
2. clear;
3. high-contrast;
4. more like a lightweight board than an admin dashboard.

## 6. API Contract For Version 1

The Mini App uses the existing founder task layer.

Required endpoints:
1. `GET /tasks`
2. `GET /tasks/:id`
3. `PATCH /tasks/:id`

This is enough for version 1 if the client can:
1. read tasks by status;
2. change `status`;
3. optionally update `priority`, `due_at`, and `assigned_role`.

If board reads become awkward during implementation, it is acceptable to add one board-friendly endpoint, but only if it clearly simplifies the client and does not bloat the API.

## 7. UI Data Mapping

### 7.1. Statuses

UI mapping:
1. `inbox` -> `Inbox`
2. `in_work` -> `In Work`
3. `done` -> `Done`

If new backend statuses appear later, they must not silently break version 1.

### 7.2. Roles

The UI must show human-readable labels instead of raw internal ids.

Suggested labels:
1. `assistant` -> `Assistant`
2. `researcher` -> `Researcher`
3. `methodist` -> `Methodist`
4. `finance_analyst` -> `Finance`
5. `critic` -> `Critic`
6. `orchestrator` -> `Orchestrator`

## 8. Relationship With Telegram

The Mini App must live inside the Telegram contour, not beside it.

Expected flow:
1. the founder opens the Mini App from Telegram;
2. the board shows founder-facing tasks;
3. when needed, the founder returns to the role topic conversation.

Important rule:
1. the Mini App does not replace same-topic workflow;
2. same-topic routing without `@role` is already the recommended live conversation path;
3. the Mini App adds visibility and light manual control, not a new runtime engine.

## 9. Non Goals

Version 1 explicitly does not solve:
1. full ops monitoring;
2. runtime budget management;
3. long-form artifact review;
4. deep audit trail;
5. orchestration debug;
6. memory review;
7. drag and drop;
8. desktop-first kanban richness.

## 10. Closure Criteria

The spec is good enough to start implementation when:
1. version 1 scope is explicit;
2. non-goals are explicit;
3. the board fields are explicit;
4. allowed founder actions are explicit;
5. the Mini App is clearly described as a layer on top of Telegram-first runtime flow;
6. mobile-first plus no drag and drop are explicit.

## 11. Next Step

The next practical step after this spec:
1. verify whether the current `tasks` endpoints are sufficient for board read and update flows;
2. if not, add only the missing board-friendly endpoints;
3. then ship the smallest useful Mini App page on Railway.
