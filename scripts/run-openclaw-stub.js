"use strict";

const express = require("express");
const { buildStubExecutionResponse, normalizeStubConfig } = require("../src/openclaw-stub");

const config = normalizeStubConfig(process.env);
const app = express();

app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "openclaw-stub",
  });
});

app.post("/execute", (req, res) => {
  const payload = req.body;

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return res.status(400).json({
      error: "execution payload must be an object",
    });
  }

  return res.json(buildStubExecutionResponse(payload));
});

app.listen(config.port, () => {
  console.log(`[openclaw-stub] listening on http://127.0.0.1:${config.port}`);
});
