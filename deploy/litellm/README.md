# LiteLLM Deploy Assets

This directory contains the first concrete deploy assets for the V2 execution layer.

Files:
1. `config.yaml` - model aliases, provider mapping, and fallback chains
2. `ops-litellm.env.example` - template for `/home/ops/.env.ops-litellm` on VPS

Intended VPS layout:
1. repo checkout: `/opt/ops/app`
2. LiteLLM config: `/opt/ops/app/deploy/litellm/config.yaml`
3. LiteLLM env file: `/home/ops/.env.ops-litellm`

Operational rules:
1. keep `ops-litellm.env.example` in git as a template only
2. never commit the real `/home/ops/.env.ops-litellm`
3. keep the real env file owned by `ops:ops`
4. keep the real env file readable only by the intended service user, for example with `chmod 600`
5. keep the LiteLLM gateway published to host localhost only through the systemd service
6. inside Docker, LiteLLM may still listen on `0.0.0.0`; the security boundary is the host publish rule `127.0.0.1:4000:4000`

Before first VPS smoke:
1. copy the template values from `ops-litellm.env.example`
2. fill real provider keys and `LITELLM_MASTER_KEY`
3. restart `ops-litellm.service`
4. run `npm run smoke:litellm`
