# Deploy Runbook

This is the first concrete VPS runbook for the `ops` contour.

## 1. Server Layout

Expected layout:
1. code: `/opt/ops/app`
2. env: `/etc/ops.env`
3. logs: `/var/log/ops`

## 2. Required Services

Systemd units:
1. `ops-api.service`
2. `ops-telegram.service`
3. `ops-worker.service`

Templates live in:
1. [deploy/systemd/ops-api.service](deploy/systemd/ops-api.service)
2. [deploy/systemd/ops-telegram.service](deploy/systemd/ops-telegram.service)
3. [deploy/systemd/ops-worker.service](deploy/systemd/ops-worker.service)

## 3. First Deploy

1. create the log directory:
   `sudo mkdir -p /var/log/ops && sudo chown ops:ops /var/log/ops`
2. clone repo to `/opt/ops/app`
3. create `/etc/ops.env`
4. verify the node binary path with `which node`
5. if `node` is not available as `/usr/bin/node`, update the systemd unit templates before installing them
6. run `npm install`
7. run `npm run db:migrate`
8. install the systemd units
9. `sudo systemctl daemon-reload`
10. `sudo systemctl enable ops-api.service ops-telegram.service ops-worker.service`
11. `sudo systemctl restart ops-api.service`
12. `sudo systemctl restart ops-telegram.service`
13. `sudo systemctl restart ops-worker.service`

## 4. Env Checklist

Required env set:
1. `DATABASE_URL`
2. `PORT`
3. `CONTROL_API_URL`
4. `TELEGRAM_BOT_TOKEN`
5. `TELEGRAM_ALLOWED_CHAT_ID`
6. `OPENCLAW_EXECUTE_URL`

Optional env set:
1. `TELEGRAM_TOPIC_MAP`
2. `WORKER_ROLE_IDS`
3. `WORKER_POLL_INTERVAL_MS`
4. `OPENCLAW_API_KEY`
5. `OPENCLAW_TIMEOUT_MS`

## 5. Smoke Checks

After restart:
1. `curl http://127.0.0.1:3000/health`
2. `systemctl status ops-api.service`
3. `systemctl status ops-telegram.service`
4. `systemctl status ops-worker.service`
5. send one Telegram message in the allowed founder group/topic
6. verify:
   - intake creates run
   - worker claims run
   - worker completes run
   - reply returns to the same Telegram topic

## 6. Restart Cycle

For future updates:
1. `git pull`
2. `npm install`
3. `npm run db:migrate`
4. `sudo systemctl restart ops-api.service`
5. `sudo systemctl restart ops-telegram.service`
6. `sudo systemctl restart ops-worker.service`
7. rerun smoke
