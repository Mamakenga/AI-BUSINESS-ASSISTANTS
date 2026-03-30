"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { authorizeInternalRequest } = require("../src/control-api-auth");

test("env example documents control api internal token", () => {
  const envExample = fs.readFileSync(path.join(__dirname, "..", ".env.example"), "utf8");

  assert.match(envExample, /^CONTROL_API_INTERNAL_TOKEN=/m);
});

test("runbook documents internal token for scheduled trigger smoke", () => {
  const runbook = fs.readFileSync(path.join(__dirname, "..", "DEPLOY_RUNBOOK.md"), "utf8");

  assert.match(runbook, /CONTROL_API_INTERNAL_TOKEN/);
  assert.match(runbook, /smoke:job-trigger/);
});

test("authorizeInternalRequest returns 503 when token is not configured", () => {
  const result = authorizeInternalRequest({}, "");

  assert.equal(result.ok, false);
  assert.equal(result.status, 503);
  assert.equal(result.body.error, "CONTROL_API_INTERNAL_TOKEN is not configured");
});

test("authorizeInternalRequest returns 401 for missing or wrong bearer token", () => {
  const missing = authorizeInternalRequest({}, "shared-secret");
  const wrong = authorizeInternalRequest({ authorization: "Bearer wrong-secret" }, "shared-secret");

  assert.equal(missing.ok, false);
  assert.equal(missing.status, 401);
  assert.equal(wrong.ok, false);
  assert.equal(wrong.status, 401);
});

test("authorizeInternalRequest returns ok=true when bearer token matches", () => {
  const result = authorizeInternalRequest({ authorization: "Bearer shared-secret" }, "shared-secret");

  assert.deepEqual(result, { ok: true });
});
