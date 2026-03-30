"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.join(__dirname, "..");

function readRepoFile(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

test("ops-litellm service publishes gateway to localhost on the host", () => {
  const service = readRepoFile(path.join("deploy", "systemd", "ops-litellm.service"));

  assert.match(service, /-p 127\.0\.0\.1:4000:4000\b/);
  assert.match(service, /--env-file \/home\/ops\/.env\.ops-litellm/);
  assert.match(service, /--host 0\.0\.0\.0 --port 4000/);
  assert.doesNotMatch(service, /-p 0\.0\.0\.0:4000:4000\b/);
  assert.doesNotMatch(service, /-p 4000:4000\b/);
  assert.doesNotMatch(service, /--network host\b/);
});

test("deploy docs keep env ownership and localhost gateway contract explicit", () => {
  const readme = readRepoFile(path.join("deploy", "litellm", "README.md"));
  const runbook = readRepoFile("DEPLOY_RUNBOOK.md");

  assert.match(readme, /owned by `ops:ops`/);
  assert.match(readme, /`127\.0\.0\.1:4000:4000`/);
  assert.match(runbook, /sudo chown ops:ops \/home\/ops\/.env\.ops-litellm && sudo chmod 600/);
  assert.match(runbook, /Localhost binding note:/);
});

test("worker and gateway auth parity stays explicit in deploy assets", () => {
  const rootEnv = readRepoFile(".env.example");
  const runbook = readRepoFile("DEPLOY_RUNBOOK.md");
  const systemdReadme = readRepoFile(path.join("deploy", "systemd", "README.md"));
  const gatewayTemplate = readRepoFile(path.join("deploy", "litellm", "ops-litellm.env.example"));

  assert.match(rootEnv, /should match LITELLM_MASTER_KEY from \/home\/ops\/\.env\.ops-litellm/);
  assert.match(runbook, /Worker-to-gateway auth rule:/);
  assert.match(runbook, /worker must send the same secret from `\/etc\/ops\.env`/);
  assert.match(systemdReadme, /worker env must carry the same secret as `LITELLM_API_KEY` or `LITELLM_MASTER_KEY`/);
  assert.match(gatewayTemplate, /^OPENROUTER_API_KEY=/m);
});
