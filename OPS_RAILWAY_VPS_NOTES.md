# Railway / VPS Deployment Notes

This file is the compact operator note for one question:

What lives on Railway, what lives on VPS, and which document wins when older design notes conflict?

## 1. Canonical Rule

For the current live `ops` contour:
1. [DEPLOY_RUNBOOK.md](DEPLOY_RUNBOOK.md) is the canonical operator runbook
2. this file is the canonical Railway/VPS responsibility split
3. if an older design note conflicts with the live contour, this file and `DEPLOY_RUNBOOK.md` win

## 2. Current Live Split

### 2.1 Railway

Railway is the managed state layer:
1. PostgreSQL
2. durable storage for `tasks`, `runs`, `messages`, `artifacts`, `memories`, `jobs`
3. optional external schedule-trigger origin, if used later

Railway is **not** the place where the current live worker contour runs.

### 2.2 VPS

VPS is the live execution layer:
1. `ops-api.service`
2. `ops-telegram.service`
3. `ops-worker.service`
4. `ops-litellm.service`
5. process logs in `/var/log/ops`
6. runtime env in `/etc/ops.env`
7. LiteLLM gateway env in `/home/ops/.env.ops-litellm`

If founder-facing Telegram traffic is flowing, it is flowing through the VPS contour.

## 3. Responsibility Matrix

### 3.1 Railway Owns

1. PostgreSQL availability
2. persistent business state
3. schema after migrations are applied
4. durability of runs, tasks, messages, memories, and artifact metadata

### 3.2 VPS Owns

1. Control API process availability
2. Telegram intake and reply delivery
3. worker execution
4. LiteLLM reachability on localhost
5. systemd service supervision
6. runtime logs and smoke verification

## 4. Practical Rule Of Thumb

If the question is:
1. "Where is the data stored?" -> Railway/Postgres
2. "Which machine must be restarted?" -> VPS
3. "Which machine delivers Telegram replies?" -> VPS
4. "Where do I inspect process logs?" -> VPS
5. "Where do I apply `git pull`, `npm install`, `db:migrate`, and service restart?" -> VPS

## 5. Typical Change Types

### 5.1 Code Change

1. local repo change
2. push to git
3. `git pull` on VPS
4. migrate if needed
5. restart services
6. smoke

### 5.2 DB Schema Change

1. migration is authored in repo
2. migration is executed from VPS
3. target database is Railway PostgreSQL

### 5.3 Env Change

1. edit `/etc/ops.env` on VPS for app/runtime settings
2. edit `/home/ops/.env.ops-litellm` only for LiteLLM gateway secrets/settings
3. restart the affected VPS services

### 5.4 Telegram Routing / Delivery Issue

1. inspect VPS logs first
2. verify `ops-telegram.service`, `ops-worker.service`, and `ops-api.service`
3. only then inspect database state

## 6. Non-Rules

1. do not assume Railway hosts the current live Control API process
2. do not assume a healthy Railway database means the founder-facing contour is healthy
3. do not assume a successful `git push` changed the live system before VPS pull + restart + smoke

## 7. Read Order For Operators

If you need to operate the live contour, read in this order:
1. `OPS_RAILWAY_VPS_NOTES.md`
2. `DEPLOY_RUNBOOK.md`
3. `IMPLEMENTATION_CHECKLIST.md`
