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
5. `AI-BUSINESS-ASSISTANTS-IMPLEMENTATION-PLAN-GPT-5.4-RU.md` - main human-readable canon in Russian
6. `AI-BUSINESS-ASSISTANTS-IMPLEMENTATION-PLAN-GPT-5.4.md` - English technical version of the same plan
7. `OPS_DEPLOYMENT_SKELETON.md` - deployment contour for the separate `ops` server user

## Core Separation Rule

This project is a separate system.

Do not mix it with:
1. coder factory implementation in `stemford-ai`
2. old business-control-plane drafts
3. Jarvis contour logic

## Current Architecture Direction

1. `VPS = execution`
   - OpenClaw runtime
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

3. `ops` is the future Linux user for this contour.

## Working Rhythm

1. one step at a time
2. keep the contour isolated
3. update the plan before adding new moving parts
4. prefer clear files over hidden assumptions

## Active Canon

1. `AI-BUSINESS-ASSISTANTS-IMPLEMENTATION-PLAN-GPT-5.4-RU.md`
2. `IMPLEMENTATION_CHECKLIST.md`
3. `TELEGRAM_ROUTING_SPEC.md`
4. `AI-BUSINESS-ASSISTANTS-IMPLEMENTATION-PLAN-GPT-5.4.md`
5. `OPS_DEPLOYMENT_SKELETON.md`
