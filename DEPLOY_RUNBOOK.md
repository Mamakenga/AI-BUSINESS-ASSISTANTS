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

## 3. First Deploy

1. create the log directory:
   `sudo mkdir -p /var/log/ops && sudo chown ops:ops /var/log/ops`
2. clone repo to `/opt/ops/app`
3. create `/etc/ops.env`
4. create `/home/ops/.env.ops-litellm` with `chmod 600`
5. verify the node binary path with `which node`
6. verify the docker binary path with `which docker`
7. if `node` is not available as `/usr/bin/node`, update the systemd unit templates before installing them
8. if `docker` is not available as `/usr/bin/docker`, update `deploy/systemd/ops-litellm.service`
9. run `npm install`
10. run `npm run db:migrate`
11. install the systemd units
12. `sudo systemctl daemon-reload`
10. `sudo systemctl enable ops-api.service ops-telegram.service ops-worker.service ops-litellm.service`
11. `sudo systemctl restart ops-litellm.service`
12. `sudo systemctl restart ops-api.service`
13. `sudo systemctl restart ops-telegram.service`
14. `sudo systemctl restart ops-worker.service`

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

LiteLLM env file (`/home/ops/.env.ops-litellm`) should include:
1. `OPENAI_API_KEY`
2. `ANTHROPIC_API_KEY`
3. `GEMINI_API_KEY`
4. `LITELLM_MASTER_KEY`

## 5. Smoke Checks

After restart:
1. `curl http://127.0.0.1:3000/health`
2. `curl -H "Authorization: Bearer $LITELLM_MASTER_KEY" http://127.0.0.1:4000/v1/models`
3. `systemctl status ops-api.service`
4. `systemctl status ops-telegram.service`
5. `systemctl status ops-worker.service`
6. `systemctl status ops-litellm.service`
7. send one Telegram message in the allowed founder group/topic
8. verify:
   - intake creates run
   - worker claims run
   - worker completes run
   - reply returns to the same Telegram topic

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
