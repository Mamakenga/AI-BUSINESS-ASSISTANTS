# Deploy Runbook

This is the first concrete VPS runbook for the `ops` contour.

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
4. `TELEGRAM_BOT_TOKEN`
5. `TELEGRAM_ALLOWED_CHAT_ID`
6. `LITELLM_BASE_URL`

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

## 5. Smoke Checks

After restart:
1. `systemctl status ops-api.service`
2. `systemctl status ops-telegram.service`
3. `systemctl status ops-worker.service`
4. `systemctl status ops-litellm.service`
5. `npm run smoke:ops-preflight`
6. `export CONTROL_API_URL=http://127.0.0.1:3000`
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
1. `git pull`
2. `npm install`
3. `npm run db:migrate`
4. `sudo systemctl restart ops-litellm.service`
5. `sudo systemctl restart ops-api.service`
6. `sudo systemctl restart ops-telegram.service`
7. `sudo systemctl restart ops-worker.service`
8. rerun smoke
