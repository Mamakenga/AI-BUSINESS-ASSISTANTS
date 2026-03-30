# START HERE

This is a separate project for the AI Business Assistants contour.

It is intentionally separated from:
1. stemford-ai coder factory work
2. old Stemford business-control ideas
3. Jarvis contour and experiments

## Read This First

If you feel lost, read only these files in this order:
1. `START_HERE.md`
2. `IMPLEMENTATION_CHECKLIST.md`
3. `RUNTIME_PROFILES.md`
4. `TELEGRAM_ROUTING_SPEC.md`
5. `AI-BUSINESS-ASSISTANTS-IMPLEMENTATION-PLAN-GPT-5.4-RU.md`
6. `AI-BUSINESS-ASSISTANTS-IMPLEMENTATION-PLAN-GPT-5.4.md`
7. `OPS_DEPLOYMENT_SKELETON.md`

## Project Map

1. `START_HERE.md` - project entry point and navigation rules
2. `IMPLEMENTATION_CHECKLIST.md` - step-by-step execution checklist with current status
3. `RUNTIME_PROFILES.md` - role runtime profiles, model routing, and memory scopes
4. `TELEGRAM_ROUTING_SPEC.md` - Telegram-first routing rules for topics, tags, threads, and task creation
5. `migrations/` - database schema changes for the control plane
6. `scripts/` - migration runner and smoke verification helpers
7. `AI-BUSINESS-ASSISTANTS-IMPLEMENTATION-PLAN-GPT-5.4-RU.md` - main human-readable canon in Russian
8. `AI-BUSINESS-ASSISTANTS-IMPLEMENTATION-PLAN-GPT-5.4.md` - English technical version of the same plan
9. `OPS_DEPLOYMENT_SKELETON.md` - deployment contour for the separate `ops` server user
10. `DEPLOY_RUNBOOK.md` - first concrete VPS deploy and smoke sequence
11. `OPENCLAW_EXECUTION_ADAPTER_OPTIONS.md` - problem statement and decision options for separate OpenClaw execution
12. `deploy/systemd/` - systemd unit templates for `ops-api`, `ops-telegram`, and `ops-worker`
13. `refs/` - curated reference library for runtimes, auth/provider paths, evals, and ops patterns
14. `V2_EXECUTION_LAYER.md` - agreed V2 execution architecture: what stays, what gets replaced, and phased migration

## Core Separation Rule

This project is a separate system.

Do not mix it with:
1. coder factory implementation in `stemford-ai`
2. old business-control-plane drafts
3. Jarvis contour logic

## Current Architecture Direction

1. `VPS = execution`
   - LiteLLM gateway
   - Telegram bridge
   - role workers
   - execution of scheduled jobs
   - process logs
   - temporary artifacts

2. `Railway = state + API + schedule-trigger`
   - PostgreSQL
   - control API
   - memory / messages / decisions / runs / artifacts metadata
   - job registry and scheduled triggers

3. `ops` is the active Linux user for this contour.
4. live `@assistant` Telegram smoke through LiteLLM already passed on 2026-03-30 in the `AI_KiberOne чат` group.

## Working Rhythm

1. one step at a time
2. keep the contour isolated
3. update the plan before adding new moving parts
4. prefer clear files over hidden assumptions
5. when implementing checklist items or plan steps, first check the matching `refs/` cards if the step touches executor choice, auth/provider paths, memory, runtime safety, evals, or ops patterns

## Active Canon

1. `AI-BUSINESS-ASSISTANTS-IMPLEMENTATION-PLAN-GPT-5.4-RU.md`
2. `IMPLEMENTATION_CHECKLIST.md`
3. `TELEGRAM_ROUTING_SPEC.md`
4. `AI-BUSINESS-ASSISTANTS-IMPLEMENTATION-PLAN-GPT-5.4.md`
5. `OPS_DEPLOYMENT_SKELETON.md`
6. `OPENCLAW_EXECUTION_ADAPTER_OPTIONS.md`
7. `V2_EXECUTION_LAYER.md`

## Reference Rule

Before implementing any checkbox item or plan step:
1. identify whether the step depends on external practice or framework choice
2. open the relevant `refs/REF_*.md` card first
3. use the reference to inform the implementation, not to silently replace the active project canon

Typical triggers for checking `refs/` first:
1. executor implementation details for the agreed V2 execution layer
2. auth and provider routing
3. memory and context handling
4. runtime safety and autonomy limits
5. evals, observability, and hardening
6. VPS/runtime topology and process supervision
