"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const express = require("express");

const {
  authorizeInternalRequest,
  buildInternalAuthHeaders,
  INTERNAL_AUTH_ROUTE_PREFIXES,
} = require("../src/control-api-auth");

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

test("buildInternalAuthHeaders injects bearer token while preserving existing headers", () => {
  const headers = buildInternalAuthHeaders("shared-secret", {
    "content-type": "application/json",
  });

  assert.deepEqual(headers, {
    "content-type": "application/json",
    authorization: "Bearer shared-secret",
  });
});

test("buildInternalAuthHeaders leaves headers unchanged when token is missing", () => {
  const headers = buildInternalAuthHeaders("", {
    "content-type": "application/json",
  });

  assert.deepEqual(headers, {
    "content-type": "application/json",
  });
});

test("internal auth route prefixes cover internal control api routes but keep founder-facing paths open", () => {
  assert.deepEqual(INTERNAL_AUTH_ROUTE_PREFIXES, [
    "/jobs",
    "/memories",
    "/memory",
    "/telegram",
    "/runs",
  ]);
  assert.ok(!INTERNAL_AUTH_ROUTE_PREFIXES.includes("/health"));
  assert.ok(!INTERNAL_AUTH_ROUTE_PREFIXES.includes("/tasks"));
});

test("internal auth middleware protects internal prefixes while leaving public routes open", async () => {
  const app = express();
  const expectedToken = "shared-secret";

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.use(INTERNAL_AUTH_ROUTE_PREFIXES, (req, res, next) => {
    const authResult = authorizeInternalRequest(req.headers, expectedToken);
    if (!authResult.ok) {
      return res.status(authResult.status).json(authResult.body);
    }
    return next();
  });

  app.post("/telegram/intake", (_req, res) => {
    res.json({ ok: true, route: "telegram/intake" });
  });

  app.post("/runs/123/complete", (_req, res) => {
    res.json({ ok: true, route: "runs/:id/complete" });
  });

  app.get("/tasks", (_req, res) => {
    res.json({ ok: true, route: "tasks" });
  });

  const server = await new Promise((resolve) => {
    const listeningServer = app.listen(0, () => resolve(listeningServer));
  });

  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const unauthorizedIntake = await fetch(`${baseUrl}/telegram/intake`, {
      method: "POST",
    });
    assert.equal(unauthorizedIntake.status, 401);

    const authorizedIntake = await fetch(`${baseUrl}/telegram/intake`, {
      method: "POST",
      headers: buildInternalAuthHeaders(expectedToken),
    });
    assert.equal(authorizedIntake.status, 200);

    const unauthorizedRunComplete = await fetch(`${baseUrl}/runs/123/complete`, {
      method: "POST",
    });
    assert.equal(unauthorizedRunComplete.status, 401);

    const publicHealth = await fetch(`${baseUrl}/health`);
    assert.equal(publicHealth.status, 200);

    const publicTasks = await fetch(`${baseUrl}/tasks`);
    assert.equal(publicTasks.status, 200);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }
});
