# V2 Execution Layer

This document fixes the agreed V2 execution architecture for `AI-BUSINESS-ASSISTANTS`.

Current implementation status:

1. P0 LiteLLM execution path is now live on VPS for the `assistant` role
2. live Telegram smoke passed on 2026-03-30 in the `AI_KiberOne чат` group
3. the next live validation target is `researcher`, after which the full server smoke suite can be marked complete

It exists to answer one concrete question:

How do we keep the current control-plane, but replace the fragile execution path with a more stable, provider-flexible execution layer?

## 1. What Stays

The current control-plane stays.

These parts are already structurally correct and should remain the backbone of the system:

1. Telegram intake and reply loop
2. `runs / tasks / messages / artifacts` lifecycle
3. worker claim/execute/complete loop
4. memory bundle resolution
5. role-based runtime profiles
6. VPS process topology around:
   - API
   - Telegram bridge
   - worker
   - database-backed state

In practical terms, this means the project keeps:

1. `src/server.js`
2. `scripts/run-role-worker.js`
3. current migrations and database model
4. Telegram routing behavior
5. current project-level separation of:
   - control-plane
   - execution layer

## 2. What Gets Replaced

The old execution path is no longer the architectural direction.

Replace:

1. OpenClaw-specific executor client assumptions
2. stub-backed execution as the long-term path
3. community-plugin-heavy Antigravity execution as the intended foundation

Target replacement:

`OpenClaw / stub execution path`

becomes

`executor adapter + LiteLLM gateway`

This means:

1. `openclaw-client` stops being the canonical execution client
2. execution should go through a provider-agnostic `executor-client`
3. model/provider routing should move to gateway/config level rather than framework-specific runtime internals

## 3. What Gets Added

### 3.1 Executor Client

Add:

1. `src/executor-client.js`

Purpose:

1. receive the current execution context from the worker
2. prepare the request for the execution backend
3. call the current gateway endpoint
4. normalize the response into the project completion contract

Minimum error contract:

1. timeout -> return executor error with provider, model alias, and timeout reason
2. rate limit / `429` -> return retriable executor error with retryable flag
3. provider `5xx` -> return retriable executor error with upstream status
4. invalid request / prompt / tool schema -> return non-retriable executor error
5. partial or malformed upstream payload -> return normalization error with raw response fragment when safe

The worker should never need provider-specific parsing logic.

Important rule:

1. the file name stays provider-agnostic
2. even if the first backend is LiteLLM, the project contract should not hard-code LiteLLM into the core naming

### 3.2 System Prompt Builder

Add:

1. `src/system-prompts.js`

Purpose:

1. build a role-specific execution prompt
2. combine:
   - role identity
   - output contract
   - task context
   - founder request
   - handoff messages
   - memory bundle
3. enforce prompt discipline and context budget

This is required because prompt construction should no longer be delegated implicitly to a framework runtime.

Context budget policy for P0:

1. role identity + output contract: target `~150 tokens`
2. task context: target `~100 tokens`
3. memory bundle: max `~500 tokens`
4. handoff messages: max `~200 tokens`, prefer the latest 2 relevant handoffs
5. total prompt ceiling for fixed scaffolding before founder request: target `~1000 tokens`

Trimming strategy:

1. preserve role identity and output contract first
2. preserve current task context second
3. trim memory before trimming task context
4. trim oldest or lowest-priority handoff context first
5. never silently inject unbounded raw message history

### 3.3 LiteLLM Gateway

Add:

1. LiteLLM as the default execution gateway
2. deploy config for provider/model routing
3. VPS service for the gateway

Purpose:

1. one stable HTTP contract
2. role-based model aliases
3. fallback chains
4. provider abstraction
5. model-level logging and routing visibility

### 3.4 Model Routing

Add:

1. explicit role-to-model mapping
2. explicit fallback chains

Routing should be driven by:

1. role
2. request type
3. execution criticality

Definitions for P0:

1. request type
   - `direct-answer`: one role, no artifact-heavy work, founder-facing answer
   - `task-execution`: role produces task output or artifact-oriented response
   - `orchestration`: planning, delegation, or coordination-heavy reasoning
2. execution criticality
   - `low`: quick draft or low-risk supporting work
   - `medium`: standard role execution
   - `high`: founder-facing critical reasoning, planning, review, or decision support

This should live in:

1. runtime profiles
2. LiteLLM gateway config

### 3.5 Future Optional Layers

These are not P0, but remain valid future directions:

1. CLI-based reserve executor backend
   - inspired by `oh-my-claudecode`
2. MCP tools layer
   - inspired by `Eggent`, `AgentScope`, and MCP-friendly runtimes
3. skills / reflection / self-improving layer
   - inspired by `Memento-Skills`
4. eval and observability hardening
   - inspired by `awesome-harness-engineering`

## 4. Migration Phases

### P0 — Replace Execution Layer

Goal:

Replace the OpenClaw/stub path with a real execution adapter backed by LiteLLM.

Scope:

1. add `src/executor-client.js`
2. add `src/system-prompts.js`
3. update worker to use executor-client instead of openclaw-client
4. define first role-to-model mappings
5. deploy LiteLLM on VPS
6. run Telegram → real LLM → reply smoke
7. keep the stub execution path available as rollback until LiteLLM smoke passes

Expected effort:

1. 1-2 calm working days including deploy and smoke

### P1 — Hardening

Goal:

Make execution observable, bounded, and production-safer.

Scope:

1. structured logging
2. token and cost boundaries
3. trace visibility
4. quality gates per role
5. stronger failure diagnostics

### P2 — Optional Executor Expansion

Goal:

Add alternative execution paths without changing the control-plane.

Scope:

1. CLI-based reserve executor backend
2. MCP-backed tool integrations
3. richer routing policies

### P3 — Learning Layer

Goal:

Evolve from memory-backed execution to skill-backed improvement.

Scope:

1. durable reusable skills
2. reflection after failure
3. skill retrieval and repair
4. role capability improvement loops

## 5. Risks / Non-Goals

### Risks

1. LiteLLM improves transport stability, but does not solve prompt quality by itself
2. role-specific routing can become messy if not kept explicit and documented
3. moving prompt construction into project code increases responsibility on our side
4. P0 still requires disciplined VPS deploy and smoke verification

## 6. Security

1. provider API keys for the LiteLLM gateway should live in a dedicated environment file such as `/home/ops/.env.ops-litellm`
2. that environment file should be readable only by the intended service user, with permissions equivalent to `600`
3. LiteLLM must be published to `127.0.0.1` on the host; inside Docker it may still listen on `0.0.0.0`
4. any internal gateway auth token should be locally generated and never committed into the repository
5. the worker should talk only to the local gateway endpoint, not to public provider endpoints directly

### Non-Goals

These are explicitly not the goal of V2 execution work:

1. replacing the current control-plane
2. importing a new all-in-one orchestration framework
3. rebuilding Telegram ingestion logic
4. solving future skills/self-improvement in the same phase
5. preserving fragile Antigravity/community-plugin paths as the primary architecture

## Decision Summary

The agreed architecture is:

1. keep the current `AI-BUSINESS-ASSISTANTS` control-plane
2. replace framework-specific execution coupling with a project-owned executor adapter
3. use LiteLLM as the default gateway for provider/model routing
4. treat CLI dispatch, MCP expansion, and skills evolution as future layers, not P0 blockers
