# AI Business Assistants Implementation Plan (GPT-5.4)

Status: Draft  
Date: 2026-03-29  
Scope: personal startup operations contour on top of OpenClaw + Antigravity + Railway + VPS

## 1. Goal

Build a practical "department" of AI business assistants for a founder-led startup with these hard constraints:

1. no meaningful spend above the existing ChatGPT / Claude / Gemini subscriptions
2. clear role separation between assistants
3. long-term memory across sessions
4. scheduled autonomous work
5. predictable behavior with minimal context mixing

This plan assumes:

1. OpenClaw already runs on VPS
2. Antigravity-backed model rotation already works for the current assistant contour
3. Telegram already acts as the main user interface
4. Railway is available for PostgreSQL, lightweight API hosting, and schedule triggering

## 2. Core Principle

Do not build a "crowd of chatting agents".

Build:

1. one orchestrator for complex multi-role work
2. several narrow role workers
3. structured memory layers
4. handoff through artifacts and inbox-style messages
5. stateless role execution

This means:

1. the orchestrator sees the broad picture when a task spans multiple roles
2. every worker receives a compact task bundle
3. workers do not share a giant common context
4. asynchronous mailbox-style handoff is preferred over real-time inter-agent chat
5. long-running autonomy lives in the scheduler plus execution layer, not in endless chats

## 3. Runtime Architecture

### 3.1 VPS responsibilities

The VPS hosts the execution layer:

1. OpenClaw runtime
2. Telegram bridge
3. role workers
4. execution of scheduled jobs after they are triggered
5. local process logs
6. temporary working artifacts

### 3.2 Railway responsibilities

Railway hosts the control, memory, and schedule-trigger layer:

1. PostgreSQL
2. lightweight control API
3. memory retrieval and write rules
4. job registry and scheduling state
5. cron-style scheduled triggers
6. owner inbox / dashboard later

### 3.3 Split of responsibility

The preferred split is:

1. Railway decides when a scheduled job should fire
2. VPS decides how the job is executed through OpenClaw
3. Railway remains the source of truth for memory, messages, decisions, runs, and artifact metadata
4. VPS remains the source of runtime execution and process-level logging

### 3.4 Antigravity role

Antigravity is treated as the model routing layer for already-paid subscriptions.

It is not the source of truth.

The source of truth remains:

1. PostgreSQL state
2. memory tables
3. runs
4. decisions
5. artifacts

## 4. Role Model

Start with seven roles.

### 4.1 orchestrator

Responsibilities:

1. receive complex founder requests
2. route work
3. collect role outputs
4. ask for approvals when needed
5. return final summaries

Important operating rule:

1. the orchestrator is not required for every single interaction
2. simple one-role requests may go directly to `assistant`, `researcher`, `methodist`, `finance_analyst`, or `critic`
3. the orchestrator becomes the default path for multi-role or ambiguous work

### 4.2 assistant

Responsibilities:

1. handle routine founder support
2. prepare daily and weekly executive digests
3. track follow-ups and unresolved threads
4. draft short operational messages and reminders

### 4.3 researcher

Responsibilities:

1. gather facts
2. monitor markets and competitors
3. collect operating signals
4. produce research summaries with sources
5. run scheduled competitor-watch style monitoring when needed

### 4.4 methodist

Responsibilities:

1. design and revise children's learning programs
2. adapt lesson structures by age or level
3. propose curriculum changes
4. prepare educational program artifacts and rationale

### 4.5 finance_analyst

Responsibilities:

1. analyze revenue and branch-level financial signals
2. compare branches on financial performance
3. detect risky deviations in numbers
4. produce short finance summaries for decision-making

### 4.6 critic

Responsibilities:

1. review high-stakes outputs from other roles
2. challenge weak assumptions and overconfident conclusions
3. produce short risk memos and contradiction checks
4. act as the formal skeptical pass before sensitive decisions

Important operating rule:

1. critic should see owner + business + task context, but not rely on rich role memory from other agents
2. critic is a reviewer, not a second generator of the whole solution

### 4.7 memory_curator

Responsibilities:

1. compact memory
2. promote stable facts to long-term memory
3. reduce memory noise
4. preserve important decisions and durable patterns

Later roles may be added:

1. hiring
2. sales ops

But not in MVP.

## 5. Model Routing via Antigravity

Use role-based routing, not one global default.

Recommended first routing order:

### orchestrator

1. Claude
2. GPT
3. Gemini

### assistant

1. GPT
2. Claude
3. Gemini

### researcher

1. Gemini
2. Claude
3. GPT

### methodist

1. Claude
2. GPT
3. Gemini

### finance_analyst

1. GPT
2. Claude
3. Gemini

### critic

1. Claude
2. GPT
3. Gemini

### memory_curator

1. Gemini
2. GPT
3. Claude

Rule:

1. the role router chooses the preferred model
2. if the current route hits limits, fallback goes to the next provider
3. every fallback is logged in the run record

## 6. Memory Design

Memory must be layered.

Do not use one giant memory store for every role.

### 6.1 Memory layers

#### owner memory

Contains:

1. communication preferences
2. decision style
3. recurring founder preferences
4. personal constraints relevant to work

Visible to:

1. all roles

#### business memory

Contains:

1. company facts
2. current priorities
3. pricing
4. core hypotheses
5. operating constraints
6. key milestones

Visible to:

1. all roles

#### role memory

Contains:

1. role-specific patterns
2. recurring wins and failures
3. local heuristics
4. role-specific playbooks

Visible to:

1. that role only

#### task memory

Contains:

1. local thread context
2. active artifacts
3. open questions
4. current task facts

Visible to:

1. participants of that task only

### 6.2 Memory write policy

Not every message becomes long-term memory.

Promote only:

1. stable facts
2. approved decisions
3. repeatable patterns
4. important preferences
5. verified conclusions

### 6.3 Memory compaction

Introduce three states:

1. raw note
2. compressed summary
3. long-term fact

One scheduled job must compact raw notes into cleaner memory.

## 7. Database Schema

The three-table version is too small for real operations.

Use at least these six tables.

### 7.1 memories

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

### 7.2 messages

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

### 7.3 decisions

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

### 7.4 jobs

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

### 7.5 runs

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

### 7.6 artifacts

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

## 8. Tooling Layer

Add tools to OpenClaw / control API.

Required MVP tools:

1. `get_memory`
2. `save_memory_candidate`
3. `read_messages`
4. `send_message`
5. `save_decision`
6. `create_artifact`
7. `read_artifacts`
8. `create_run_log`

Important rule:

1. the worker wrapper calls retrieval automatically
2. roles should not be trusted to remember to fetch context manually
3. roles may read decisions, but decision writes remain founder-controlled or explicitly founder-authorized

## 9. Execution Pattern

### 9.1 Founder request flow

1. founder writes in Telegram
2. if the founder directly addresses a role for a simple one-role task, the system routes straight to that role
3. otherwise the orchestrator classifies the request
4. the orchestrator decides whether it is:
   - direct answer
   - one-role task
   - multi-role task
5. system creates a thread and run record
6. relevant memory bundle is assembled
7. the selected role runs
8. artifacts are stored
9. if needed, follow-up runs can be assigned to assistant, researcher, methodist, finance_analyst, or critic
10. the orchestrator replies to the founder when orchestration was involved

### 9.2 Inter-agent flow

Roles do not talk in a free-for-all chat.

They communicate through:

1. inbox messages for short async notes and handoff signals
2. artifacts for reusable structured outputs
3. approved decisions

Example:

1. researcher writes a research artifact
2. methodist or finance_analyst reads that artifact if relevant
3. assistant prepares the executive summary or follow-up packet
4. orchestrator summarizes

## 10. Scheduled Jobs

Start with six jobs only.

### 10.1 daily founder brief

Schedule:

1. every morning

Agent:

1. assistant

Output:

1. short Telegram digest

### 10.2 weekly digest

Schedule:

1. Monday morning

Agent:

1. assistant

Output:

1. decisions
2. risks
3. unresolved items

### 10.3 competitor watch

Schedule:

1. daily

Agent:

1. researcher

Output:

1. notable market changes
2. memory updates
3. messages to assistant, methodist, or finance_analyst when relevant

### 10.4 branch finance review

Schedule:

1. Friday evening

Agent:

1. finance_analyst

Output:

1. branch-level financial anomalies
2. risky trends in numbers
3. short recommendations or questions for the founder

### 10.5 weekly risk review

Schedule:

1. Friday evening after finance review

Agent:

1. critic

Output:

1. contradiction checks across active decisions
2. short list of weak assumptions
3. escalation notes for the founder when a proposal looks fragile

### 10.6 memory cleanup

Schedule:

1. twice per week

Agent:

1. memory_curator

Output:

1. compacted memory
2. promoted long-term facts

## 11. Context Isolation Rules

These are non-negotiable.

1. every run is stateless
2. role memory is isolated
3. workers see only the minimum relevant memory bundle
4. messages require `thread_id`
5. artifacts require `task_id`
6. decisions are founder-approved facts and are read-only for normal role execution
7. no shared global free-form role chat
8. no unlimited carry-over session context

## 12. UX Model

Keep the founder interface simple.

Telegram remains the primary interface.

### 12.1 Telegram group model

The preferred UX is one Telegram group with Topics enabled.

Recommended topic structure:

1. `00 Orchestrator`
2. `01 Assistant`
3. `02 Researcher`
4. `03 Methodist`
5. `04 Finance`
6. `05 Critic`

`memory_curator` remains internal by default and does not need a user-facing topic in MVP.

### 12.2 Routing inside the group

Routing rules:

1. if the founder writes in a role topic, the message is routed to that role
2. if the founder explicitly tags a role, the tag overrides the topic default
3. if the founder writes in `00 Orchestrator`, the orchestrator may invoke multiple roles
4. simple one-role tasks can be sent directly to `@assistant`, `@researcher`, `@methodist`, `@finance`, or `@critic`
5. internal cross-role coordination should stay in the backend message/artifact layer, not in noisy public Telegram chatter

### 12.3 Founder UX

The founder experience should be:

1. for simple work, address the role directly
2. for complex work, ask the orchestrator
3. the right assistant works with compact context
4. the result comes back in a clean format

Optional later:

1. a lightweight Railway dashboard
2. inbox of scheduled outputs
3. memory review screen
4. job status screen

## 13. MVP Build Sequence

### Phase 1. Data foundation

1. provision Railway PostgreSQL
2. create the six tables
3. add simple indexes on scope, thread_id, task_id, and created_at

### Phase 2. API foundation

1. build a tiny control API
2. expose read/write endpoints for memory, messages, decisions, artifacts, jobs, runs
3. add agent-safe validation

### Phase 3. OpenClaw tool layer

1. define the eight tools
2. bind them to the existing assistant contour
3. ensure retrieval happens in the wrapper, not by manual skill discipline alone

### Phase 4. Role rollout

1. create seven role profiles
2. connect each role to its Antigravity routing chain
3. test one-role tasks
4. test researcher -> assistant -> finance_analyst or methodist handoff
5. test critic review on one high-stakes multi-role output

### Phase 5. Scheduler

1. add cron or systemd timers on VPS
2. start with daily founder brief and competitor watch
3. add weekly critic review
4. log every run to `runs`

### Phase 6. Memory hygiene

1. implement memory compaction
2. limit how many facts each role retrieves
3. test repeated sessions over several days

## 14. Budget Logic

Target budget:

1. keep the existing subscriptions as the main model budget
2. use Antigravity-backed routing to spend those already-paid limits
3. use Railway free tier if sufficient
4. keep scheduled tasks short and structured

Risk:

1. even if token cost is near-zero through the current routing setup, large memory bundles still create latency and quota pressure

Therefore:

1. optimize for compact prompts
2. optimize for summaries, not raw chat dumps
3. optimize for role isolation

## 15. Success Criteria

The assistant department is considered working when:

1. the founder can either use direct role calls for simple work or the orchestrator for complex work
2. the Telegram group topics route work predictably to the intended role
3. at least four role workers operate reliably
4. daily and weekly scheduled outputs arrive automatically
5. memory survives across sessions
6. role outputs are consistent and do not bleed context into each other
7. critic can review sensitive outputs before the founder acts on them
8. major decisions are preserved and reused later

## 16. Final Recommendation

Do not start with a huge "department".

Start with:

1. orchestrator
2. assistant
3. researcher
4. methodist
5. finance_analyst
6. critic
7. memory_curator

And build the system around:

1. Railway Postgres
2. OpenClaw on VPS
3. Antigravity role routing
4. stateless runs
5. layered memory
6. scheduled jobs
7. artifact-based handoffs

That is the smallest architecture that satisfies the founder use case without unnecessary complexity.
