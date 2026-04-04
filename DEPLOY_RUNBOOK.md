# Deploy Runbook

This is the first concrete VPS runbook for the `ops` contour.

It answers one operational question:

How do we safely update the live `ops` contour on VPS without relying on memory or chat history?

## 1. Server Layout

Expected layout:
1. code: `/opt/ops/app`
2. env: `/etc/ops.env`
3. LiteLLM env: `/home/ops/.env.ops-litellm`
4. logs: `/var/log/ops`

## 2. Required Services

Systemd units:
1. `ops-api.service`
2. `ops-telegram.service`
3. `ops-worker.service`
4. `ops-litellm.service`

Templates live in:
1. [deploy/systemd/ops-api.service](deploy/systemd/ops-api.service)
2. [deploy/systemd/ops-telegram.service](deploy/systemd/ops-telegram.service)
3. [deploy/systemd/ops-worker.service](deploy/systemd/ops-worker.service)
4. [deploy/systemd/ops-litellm.service](deploy/systemd/ops-litellm.service)
5. [deploy/litellm/config.yaml](deploy/litellm/config.yaml)
6. [deploy/litellm/ops-litellm.env.example](deploy/litellm/ops-litellm.env.example)

## 3. First Deploy

1. create the log directory:
   `sudo mkdir -p /var/log/ops && sudo chown ops:ops /var/log/ops`
2. clone repo to `/opt/ops/app`
3. create `/etc/ops.env`
4. copy `deploy/litellm/ops-litellm.env.example` to `/home/ops/.env.ops-litellm`, then run `sudo chown ops:ops /home/ops/.env.ops-litellm && sudo chmod 600 /home/ops/.env.ops-litellm`
5. verify the node binary path with `which node`
6. verify the docker binary path with `which docker`
7. if `node` is not available as `/usr/bin/node`, update the systemd unit templates before installing them
8. if `docker` is not available as `/usr/bin/docker`, update `deploy/systemd/ops-litellm.service`
9. run `npm install`
10. run `npm run db:migrate`
11. install the systemd units
12. `sudo systemctl daemon-reload`
13. `sudo systemctl enable ops-api.service ops-telegram.service ops-worker.service ops-litellm.service`
14. `sudo systemctl restart ops-litellm.service`
15. `sudo systemctl restart ops-api.service`
16. `sudo systemctl restart ops-telegram.service`
17. `sudo systemctl restart ops-worker.service`

## 4. Env Checklist

Required env set:
1. `DATABASE_URL`
2. `PORT`
3. `CONTROL_API_URL`
4. `CONTROL_API_INTERNAL_TOKEN`
5. `TELEGRAM_BOT_TOKEN`
6. `TELEGRAM_ALLOWED_CHAT_ID`
7. `LITELLM_BASE_URL`

Optional env set:
1. `TELEGRAM_TOPIC_MAP`
2. `WORKER_ROLE_IDS`
3. `WORKER_POLL_INTERVAL_MS`
4. `LITELLM_API_KEY` or `LITELLM_MASTER_KEY`
5. `LITELLM_TIMEOUT_MS`

Worker-to-gateway auth rule:
1. if LiteLLM runs with `LITELLM_MASTER_KEY`, the worker must send the same secret from `/etc/ops.env`
2. set either `LITELLM_API_KEY=<same secret>` or `LITELLM_MASTER_KEY=<same secret>` in `/etc/ops.env`
3. if this value is missing, the worker will reach LiteLLM but fail on authenticated requests

LiteLLM env file (`/home/ops/.env.ops-litellm`) should include:
1. `OPENROUTER_API_KEY`
2. `LITELLM_MASTER_KEY`

Telegram forum note:
1. if the working chat is upgraded from a group to a supergroup, Telegram will issue a new `chat_id`
2. update `TELEGRAM_ALLOWED_CHAT_ID` in `/etc/ops.env`
3. restart `ops-telegram.service` and `ops-worker.service`
4. send one manual message in each role topic you want to bind, so `telegram_threads` captures `message_thread_id` and `topic_name`

## 5. Smoke Checks

After restart:
1. `systemctl status ops-api.service`
2. `systemctl status ops-telegram.service`
3. `systemctl status ops-worker.service`
4. `systemctl status ops-litellm.service`
5. `npm run smoke:ops-preflight`
6. `export CONTROL_API_URL=http://127.0.0.1:3300`
7. `export LITELLM_BASE_URL=http://127.0.0.1:4000`
8. `export LITELLM_MASTER_KEY=<same value as /home/ops/.env.ops-litellm>`
9. `export SMOKE_LITELLM_MODEL=assistant-model`
10. `export SMOKE_LITELLM_EXPECT_TEXT=OK`
11. `npm run smoke:ops-stack`
12. these shell exports are for the smoke command only; `ops-worker.service` still reads LiteLLM auth from `/etc/ops.env`
13. send one Telegram message in the allowed founder group/topic
14. verify:
   - intake creates run
   - worker claims run
   - worker completes run
   - reply returns to the same Telegram topic

Optional reproducible gateway smoke:
1. `export LITELLM_BASE_URL=http://127.0.0.1:4000`
2. `export LITELLM_MASTER_KEY=<same value as /home/ops/.env.ops-litellm>`
3. `export SMOKE_LITELLM_MODEL=assistant-model`
4. `export SMOKE_LITELLM_EXPECT_TEXT=OK`
5. `npm run smoke:litellm`

Combined pre-Telegram smoke:
1. `npm run smoke:ops-preflight`
2. this checks worker env, gateway env, shared auth secret, and local LiteLLM base URL contract
3. `npm run smoke:ops-stack`
4. this checks `CONTROL_API_URL/health` first and LiteLLM `/v1/models` second
5. use both before the manual Telegram founder-message smoke
6. a passing `smoke:ops-stack` does not prove worker auth unless `/etc/ops.env` already contains the matching LiteLLM secret

Localhost binding note:
1. `ops-litellm.service` publishes `127.0.0.1:4000:4000` on the host
2. LiteLLM may listen on `0.0.0.0` inside Docker so the published port remains reachable from the host namespace
3. the security boundary is the host-side localhost publish, not the container-internal bind address

## 6. Restart Cycle

For future updates:
1. `cd /opt/ops/app`
2. `sudo -u ops git -C /opt/ops/app pull --ff-only`
3. `sudo -u ops bash -lc 'cd /opt/ops/app && npm install'`
4. `sudo -u ops bash -lc 'set -a; source /etc/ops.env; set +a; cd /opt/ops/app && npm run db:migrate'`
5. `sudo systemctl daemon-reload`
6. `sudo systemctl restart ops-litellm.service`
7. `sudo systemctl restart ops-api.service`
8. `sudo systemctl restart ops-telegram.service`
9. `sudo systemctl restart ops-worker.service`
10. rerun smoke

## 7. Canonical Update Sequence

Use this sequence for every routine VPS update after the first deploy.

### 7.1 Pull

1. `cd /opt/ops/app`
2. `sudo -u ops git -C /opt/ops/app pull --ff-only`

Pass condition:
1. repository fast-forwards cleanly to the intended commit

If this fails:
1. stop here
2. inspect local changes or upstream divergence before touching services

### 7.2 Migrate

1. `cd /opt/ops/app`
2. `sudo -u ops bash -lc 'cd /opt/ops/app && npm install'`
3. `sudo -u ops bash -lc 'set -a; source /etc/ops.env; set +a; cd /opt/ops/app && npm run db:migrate'`

Pass condition:
1. dependencies install without error
2. migrations complete without error

If this fails:
1. do not restart services yet
2. inspect migration output first

### 7.3 Restart

1. `sudo systemctl daemon-reload`
2. `sudo systemctl restart ops-litellm.service`
3. `sudo systemctl restart ops-api.service`
4. `sudo systemctl restart ops-telegram.service`
5. `sudo systemctl restart ops-worker.service`

Pass condition:
1. all four services restart without immediate failure

Quick verification:
1. `systemctl status ops-litellm.service --no-pager`
2. `systemctl status ops-api.service --no-pager`
3. `systemctl status ops-telegram.service --no-pager`
4. `systemctl status ops-worker.service --no-pager`

If this fails:
1. inspect the failing service log first
2. do not continue to smoke until service status is healthy

### 7.4 Smoke

1. `sudo -u ops bash -lc 'cd /opt/ops/app && npm run smoke:ops-preflight'`
2. `sudo -u ops bash -lc 'cd /opt/ops/app && export CONTROL_API_URL=http://127.0.0.1:3300 && export LITELLM_BASE_URL=http://127.0.0.1:4000 && export LITELLM_MASTER_KEY=$(grep "^LITELLM_MASTER_KEY=" /home/ops/.env.ops-litellm | cut -d= -f2-) && export SMOKE_LITELLM_MODEL=assistant-model && export SMOKE_LITELLM_EXPECT_TEXT=OK && npm run smoke:ops-stack'`
3. send one founder-facing Telegram message in the allowed chat
4. verify worker log shows:
   - completed run
   - delivered telegram reply

Pass condition:
1. `smoke:ops-preflight` passes
2. `smoke:ops-stack` passes
3. one real Telegram reply returns to the same chat/topic

If this fails:
1. keep the failure localized to the current stage:
   - preflight -> env/auth mismatch
   - stack smoke -> API or LiteLLM gateway problem
   - Telegram smoke -> bridge/worker/runtime routing issue

Optional reproducible scheduled-trigger smoke:
1. `sudo -u ops bash -lc 'cd /opt/ops/app && export CONTROL_API_URL=http://127.0.0.1:3300 && export CONTROL_API_INTERNAL_TOKEN=$(grep "^CONTROL_API_INTERNAL_TOKEN=" /etc/ops.env | cut -d= -f2-) && npm run smoke:job-trigger'`
2. this checks the internal auth gate and the `POST /jobs/:jobType/trigger` path without waiting for Railway
3. default smoke target is `daily_founder_brief -> assistant`
4. if delivery fails with `migrate_to_chat_id`, update `TELEGRAM_ALLOWED_CHAT_ID` and restart `ops-telegram.service` plus `ops-worker.service`

## 8. Current Known-Good Example

Validated on 2026-03-30:

1. `ops-litellm.service` active with OpenRouter-backed LiteLLM
2. `smoke:ops-preflight` passed
3. `smoke:ops-stack` passed
4. live Telegram smoke passed in `AI_KiberOne чат`
5. worker log confirmed:
   - `completed run 21 for assistant`
   - `completed run 22 for researcher`
   - matching Telegram reply delivery lines

## 9. Internal Token Rotation Policy

`CONTROL_API_INTERNAL_TOKEN` is the shared bearer secret for:
1. `ops-telegram.service -> ops-api.service`
2. `ops-worker.service -> ops-api.service`
3. internal operator smokes such as `smoke:job-trigger`

This token must:
1. live only in `/etc/ops.env`
2. be treated as a VPS-local operational secret
3. never be committed to git, copied into docs, or pasted into chat

### 9.1. When Rotation Is Required

Rotate immediately when any of these is true:
1. the token may have been exposed in chat, screenshots, shell history, or logs
2. VPS access changed hands
3. `/etc/ops.env` was rebuilt or manually edited under uncertainty
4. internal auth failures suggest token drift between services

Recommended planned renewal:
1. renew on a regular cadence, for example every 90 days
2. renew before or after a larger infrastructure handoff if ownership changed

### 9.2. Rotation Rules

1. rotate `ops-api`, `ops-worker`, and `ops-telegram` together
2. do not rotate only one service in isolation
3. after editing `/etc/ops.env`, restart all three services in one window
4. treat rotation as incomplete until smoke passes

### 9.3. Canonical Rotation Procedure

1. generate a new token on VPS:
   `openssl rand -hex 32`
2. replace only `CONTROL_API_INTERNAL_TOKEN` in `/etc/ops.env`
3. restart:
   - `sudo systemctl restart ops-api.service`
   - `sudo systemctl restart ops-telegram.service`
   - `sudo systemctl restart ops-worker.service`
4. run internal auth smoke:
   `sudo -u ops bash -lc 'cd /opt/ops/app && export CONTROL_API_URL=http://127.0.0.1:3300 && export CONTROL_API_INTERNAL_TOKEN=$(grep "^CONTROL_API_INTERNAL_TOKEN=" /etc/ops.env | cut -d= -f2-) && npm run smoke:job-trigger'`
5. send one founder-facing Telegram message and verify:
   - intake succeeds
   - worker completes run
   - reply returns to the same topic

Pass condition:
1. `smoke:job-trigger` succeeds
2. one real Telegram request also succeeds
3. fresh post-restart API log lines do not show `control_api_internal_auth_not_configured`
4. services remain healthy after restart

### 9.4. Renewal vs Emergency Rotation

Planned renewal:
1. use the canonical procedure above
2. no rollback is expected if smoke passes

Emergency rotation after possible exposure:
1. replace the token immediately
2. restart all three services immediately
3. run `smoke:job-trigger`
4. run one Telegram smoke
5. if smoke fails, fix `/etc/ops.env` and restart again rather than disabling internal auth

### 9.5. Non-Rules

1. do not disable internal auth to "get the contour working again"
2. do not keep old and new tokens in parallel
3. do not store the token in ad-hoc shell files outside `/etc/ops.env`
