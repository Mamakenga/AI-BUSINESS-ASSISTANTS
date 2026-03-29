# OPS Deployment Skeleton

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

1. `OpenClaw runtime`
2. `Telegram bridge`
3. `role workers`
4. `scheduled execution after trigger`
5. `process-level logs`
6. `temporary working artifacts`

## Railway Responsibilities

1. `PostgreSQL`
2. `Control API`
3. `job registry`
4. `schedule-trigger logic`
5. `memory / messages / decisions / runs / artifact metadata`

## Preferred Service Names

1. `ops-api.service`
2. `ops-telegram.service`
3. `ops-worker.service`
4. `ops-scheduler.service`

Concrete templates already live in:
1. [deploy/systemd/ops-api.service](deploy/systemd/ops-api.service)
2. [deploy/systemd/ops-telegram.service](deploy/systemd/ops-telegram.service)
3. [deploy/systemd/ops-worker.service](deploy/systemd/ops-worker.service)

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

1. Railway decides when a scheduled job should fire
2. VPS decides how the job runs through OpenClaw
3. Railway stores canonical state
4. VPS stores runtime state and process logs

## First Smoke Checks

1. `ops-api.service` is active
2. `ops-telegram.service` is active
3. `ops-worker.service` is active
4. scheduled trigger can reach VPS
5. one role run completes and writes state back to Railway
```
