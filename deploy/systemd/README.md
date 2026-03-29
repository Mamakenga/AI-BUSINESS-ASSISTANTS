# systemd Units

These are the first concrete VPS service files for the `ops` contour.

Install target:
1. copy `ops-api.service` to `/etc/systemd/system/ops-api.service`
2. copy `ops-telegram.service` to `/etc/systemd/system/ops-telegram.service`
3. copy `ops-worker.service` to `/etc/systemd/system/ops-worker.service`

Expected runtime layout:
1. app code in `/opt/ops/app`
2. env file in `/etc/ops.env`
3. logs in `/var/log/ops`

Suggested activation flow:
1. `sudo systemctl daemon-reload`
2. `sudo systemctl enable ops-api.service ops-telegram.service ops-worker.service`
3. `sudo systemctl restart ops-api.service`
4. `sudo systemctl restart ops-telegram.service`
5. `sudo systemctl restart ops-worker.service`

First smoke checks:
1. `systemctl status ops-api.service`
2. `systemctl status ops-telegram.service`
3. `systemctl status ops-worker.service`
4. `curl http://127.0.0.1:3000/health`
