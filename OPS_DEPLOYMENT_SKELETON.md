# OPS Deployment Skeleton

If this file conflicts with the current live contour, defer to:
1. [OPS_RAILWAY_VPS_NOTES.md](OPS_RAILWAY_VPS_NOTES.md)
2. [DEPLOY_RUNBOOK.md](DEPLOY_RUNBOOK.md)

## Goal

This file defines the deployment skeleton for the separate `ops` contour.

The purpose is to keep AI Business Assistants independent from old Stemford and coder-factory contours.

## Naming

1. Linux user: `ops`
2. App root: `/opt/ops`
3. Working directory: `/opt/ops/app`
4. Runtime temp directory: `/opt/ops/runtime`
5. Logs directory: `/var/log/ops`
6. Env file: `/etc/ops.env`

## VPS Responsibilities

1. `LiteLLM gateway`
2. `Control API`
3. `Telegram bridge`
4. `role workers`
5. `scheduled execution after trigger`
6. `process-level logs`
7. `temporary working artifacts`

## Railway Responsibilities

1. `PostgreSQL`
2. `durable state for jobs / tasks / runs / messages / artifacts / memories`
3. `optional schedule-trigger origin if used later`

## Preferred Service Names

1. `ops-api.service`
2. `ops-telegram.service`
3. `ops-worker.service`
4. `ops-scheduler.service`

Concrete templates already live in:
1. [deploy/systemd/ops-api.service](deploy/systemd/ops-api.service)
2. [deploy/systemd/ops-telegram.service](deploy/systemd/ops-telegram.service)
3. [deploy/systemd/ops-worker.service](deploy/systemd/ops-worker.service)
4. [deploy/systemd/ops-litellm.service](deploy/systemd/ops-litellm.service)

## Suggested Directory Layout

```text
/opt/ops/
  app/
  runtime/
  tmp/
/var/log/ops/
/etc/ops.env
```

## Execution Split

1. Railway stores canonical durable state
2. VPS hosts the live execution path and operational services
3. if a schedule-trigger origin is used externally, it still feeds into the VPS execution path
4. process supervision and runtime logs stay on VPS

## First Smoke Checks

1. `ops-api.service` is active
2. `ops-telegram.service` is active
3. `ops-worker.service` is active
4. `ops-litellm.service` is active
5. one role run completes and writes state back to Railway
6. founder-facing Telegram reply returns to the same chat/topic
