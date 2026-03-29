# Telegram Routing Spec

Это рабочая спецификация Telegram-first контура для `AI-BUSINESS-ASSISTANTS`.

Документ отвечает на вопросы:
1. как founder общается с системой в Telegram;
2. как определяется роль-исполнитель;
3. когда создаётся только `thread`, а когда ещё и `task`;
4. что показывается founder-у, а что остаётся во внутреннем backend-слое.

## 1. Главный принцип

Telegram — это первый пользовательский интерфейс системы.

Порядок такой:
1. сначала Telegram-группа и ролевой routing;
2. потом живой Telegram-first workflow;
3. только потом Mini App board как дополнительный control surface.

## 2. Telegram Surface

Используется одна Telegram-группа с включёнными Topics.

Рекомендуемые темы:
1. `00 Orchestrator`
2. `01 Assistant`
3. `02 Researcher`
4. `03 Methodist`
5. `04 Finance`
6. `05 Critic`

`memory_curator` остаётся внутренней сервисной ролью и не требует пользовательской темы в MVP.

Если founder пишет в стандартную Telegram-тему `General` внутри этой же группы:
1. сообщение по умолчанию маршрутизируется в `orchestrator`;
2. это считается нормальным founder entry point, а не ошибкой маршрутизации.

## 3. Role Aliases

Поддерживаются такие публичные теги:
1. `@orchestrator`
2. `@assistant`
3. `@researcher`
4. `@methodist`
5. `@finance`
6. `@critic`

Внутренний маппинг:
1. `@finance -> finance_analyst`
2. `@critic -> critic`
3. остальные алиасы совпадают с runtime role id

## 4. Routing Order

Порядок выбора роли такой:
1. если в сообщении есть явный тег роли, приоритет у тега;
2. если тега нет, но сообщение написано в ролевой теме, используется роль темы;
3. если сообщение написано в стандартной теме `General`, роль по умолчанию — `orchestrator`;
4. если сообщение пришло вне группового контекста или из темы без привязки к роли, и роль нельзя определить однозначно, система не гадает молча, а возвращает короткую подсказку founder-у.

## 5. Founder Message Types

Telegram-вход делится на три типа.

### 5.1. Direct answer

Это короткий вопрос, не требующий отдельной задачи.

Примеры:
1. “@finance какая у нас динамика по марту?”
2. “@assistant что у меня сегодня срочное?”

Что происходит:
1. создаётся `thread_id`;
2. создаётся `founder_message`;
3. создаётся `run`;
4. отдельный `task` не создаётся.

### 5.2. One-role task

Это нормальная задача для одной роли.

Примеры:
1. “@methodist предложи обновление модуля для 9-11 лет”
2. “@researcher сравни конкурентов в Варне”

Что происходит:
1. создаётся `thread_id`;
2. создаётся `task`;
3. создаётся `run` для выбранной роли.

### 5.3. Multi-role task

Это сложная задача через несколько ролей или с неочевидной маршрутизацией.

Примеры:
1. “@orchestrator стоит ли запускать новый летний интенсив?”
2. “@orchestrator собери мне картину по проблемам трёх филиалов”

Что происходит:
1. создаётся `thread_id`;
2. создаётся `task`;
3. первый `run` идёт в `orchestrator`;
4. дальше orchestrator создаёт follow-up runs для других ролей.

## 6. Task Creation Rule

Не каждое входящее сообщение становится `task`.

`task` создаётся, если выполнено хотя бы одно условие:
1. founder явно поручает что-то сделать;
2. работа требует follow-up;
3. ожидается артефакт, summary или deliverable;
4. задача не укладывается в один короткий direct answer.

Если это просто быстрый вопрос:
1. создаётся только `thread`;
2. ответ сохраняется в сообщениях/логах;
3. `task` не плодится без необходимости.

## 7. Thread Rule

Каждый значимый Telegram-поток получает `thread_id`.

Это нужно, чтобы:
1. не смешивать контекст между темами и поручениями;
2. правильно хранить межролевые сообщения;
3. потом связывать Telegram-поток с founder board task при необходимости.

## 8. Response Rule

Founder должен видеть только полезный уровень системы.

Поэтому:
1. direct-answer reply возвращается в ту же Telegram-тему;
2. direct-answer path может сохранять `thread + founder_message + run`, но без `task`;
3. прямой one-role ответ возвращается в ту же Telegram-тему;
4. multi-role итог возвращает `orchestrator`;
5. внутренние handoff между ролями не выводятся в общий видимый поток;
6. сырые `runs`, `fallback chains`, `memory internals` и технические логи не показываются founder-у в основном Telegram UX.

## 9. Backend Rule

Под капотом Telegram routing обязан писать в control plane:
1. `messages`
2. `runs`
3. при необходимости `tasks`
4. позже — `artifacts`

Но Telegram не должен быть source of truth.

Source of truth остаются:
1. PostgreSQL
2. Control API
3. runtime logs на execution side

## 10. First Implementation Scope

Первая живая версия Telegram-first flow должна уметь:
1. принять сообщение из Telegram;
2. определить роль по тегу или теме;
3. создать `thread_id`;
4. при необходимости создать `task`;
5. записать `run`;
6. вернуть ответ в ту же тему.

Чего в первом шаге не нужно:
1. сложной оркестрации через много ролей сразу;
2. Mini App board;
3. drag & drop;
4. полной memory automation.

## 11. Success Criteria

Telegram routing spec считается реализованным в коде, когда:
1. `@assistant`, `@researcher`, `@methodist`, `@finance`, `@critic` работают предсказуемо;
2. `@orchestrator` запускает отдельный orchestration path;
3. тема Telegram может задавать роль по умолчанию;
4. короткие direct answer не плодят лишние задачи;
5. настоящие поручения создают `task + thread + run`;
6. founder не видит подкапотный шум.
