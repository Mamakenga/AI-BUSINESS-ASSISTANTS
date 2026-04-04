"use strict";

const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const path = require("node:path");
const process = require("node:process");
const { Pool } = require("pg");
const { buildInternalAuthHeaders } = require("../src/control-api-auth");

const DATABASE_URL = process.env.DATABASE_URL || "";

if (!DATABASE_URL) {
  throw new Error("DATABASE_URL is required");
}

const PORT = Number.parseInt(process.env.SMOKE_PORT || "3100", 10);
const BASE_URL = `http://127.0.0.1:${PORT}`;
const INTERNAL_TOKEN = "smoke-internal-token";
const suffix = Date.now().toString(36);
const appPath = path.join(__dirname, "..", "src", "server.js");
const cleanupState = {
  artifactIds: [],
  memoryIds: [],
  messageIds: [],
  runIds: [],
  taskIds: [],
};

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function request(method, pathname, body) {
  const headers = body
    ? buildInternalAuthHeaders(INTERNAL_TOKEN, { "content-type": "application/json" })
    : buildInternalAuthHeaders(INTERNAL_TOKEN);
  const response = await fetch(`${BASE_URL}${pathname}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await response.text();
  let json = null;
  if (text.length > 0) {
    try {
      json = JSON.parse(text);
    } catch (_error) {
      throw new Error(`Expected JSON from ${method} ${pathname}, got: ${text}`);
    }
  }

  if (!response.ok) {
    throw new Error(`${method} ${pathname} failed with ${response.status}: ${JSON.stringify(json)}`);
  }

  return json;
}

async function waitForHealth() {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const health = await request("GET", "/health");
      if (health.ok === true) {
        return health;
      }
    } catch (_error) {
      // Ignore until timeout.
    }
    await sleep(500);
  }

  throw new Error("control-api did not become healthy in time");
}

async function stopChildProcess(child) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return;
  }

  await new Promise((resolve) => {
    let settled = false;

    function finish() {
      if (settled) {
        return;
      }
      settled = true;
      resolve();
    }

    child.once("exit", finish);
    child.kill();

    setTimeout(() => {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill("SIGKILL");
      }
      finish();
    }, 3000);
  });
}

async function cleanupSmokeData() {
  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: process.env.PGSSLMODE === "disable" ? false : { rejectUnauthorized: false },
  });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    if (cleanupState.artifactIds.length > 0) {
      await client.query("DELETE FROM artifacts WHERE id = ANY($1::bigint[])", [cleanupState.artifactIds]);
    }
    if (cleanupState.messageIds.length > 0) {
      await client.query("DELETE FROM messages WHERE id = ANY($1::bigint[])", [cleanupState.messageIds]);
    }
    if (cleanupState.runIds.length > 0) {
      await client.query("DELETE FROM runs WHERE id = ANY($1::bigint[])", [cleanupState.runIds]);
    }
    if (cleanupState.taskIds.length > 0) {
      await client.query("DELETE FROM tasks WHERE id = ANY($1::text[])", [cleanupState.taskIds]);
    }
    if (cleanupState.memoryIds.length > 0) {
      await client.query("DELETE FROM memories WHERE id = ANY($1::bigint[])", [cleanupState.memoryIds]);
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

async function main() {
  const child = spawn(process.execPath, [appPath], {
    cwd: path.join(__dirname, ".."),
    env: {
      ...process.env,
      PORT: String(PORT),
      DATABASE_URL,
      CONTROL_API_INTERNAL_TOKEN: INTERNAL_TOKEN,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  child.stdout.on("data", (chunk) => {
    process.stdout.write(`[server] ${chunk}`);
  });
  child.stderr.on("data", (chunk) => {
    process.stderr.write(`[server] ${chunk}`);
  });

  try {
    const health = await waitForHealth();
    assert.equal(health.service, "control-api", "health endpoint returned unexpected service");

    const routePreview = await request("POST", "/telegram/route-preview", {
      text: "@researcher compare competitors in Varna",
      topic_name: "02 Researcher",
    });
    assert.equal(routePreview.resolved_role, "researcher", "route preview did not resolve researcher");

    const directAnswerIntake = await request("POST", "/telegram/intake", {
      text: `@assistant what is urgent today ${suffix}?`,
      topic_name: "01 Assistant",
    });
    assert.equal(directAnswerIntake.persisted, true, "direct-answer intake did not persist");
    assert.equal(directAnswerIntake.route.interaction_type, "direct_answer", "direct-answer route type mismatch");
    assert.equal(directAnswerIntake.route.should_create_task, false, "direct-answer should not create a task");
    assert.equal(directAnswerIntake.task, null, "direct-answer unexpectedly created a task");
    assert.ok(directAnswerIntake.run, "direct-answer run was not created");
    assert.equal(directAnswerIntake.run.task_id, null, "direct-answer run should not be task-bound");
    cleanupState.messageIds.push(directAnswerIntake.founder_message.id);
    cleanupState.runIds.push(directAnswerIntake.run.id);

    const ownerMemory = await request("POST", "/memories/candidates", {
      scope: "owner",
      fact: `Founder prefers concise answers (${suffix})`,
      source: "smoke",
    });
    const businessMemory = await request("POST", "/memories/candidates", {
      scope: "business",
      fact: `Three branches are active (${suffix})`,
      source: "smoke",
    });
    const roleMemory = await request("POST", "/memories/candidates", {
      scope: "role",
      scope_id: "researcher",
      fact: `Last competitor research was refreshed (${suffix})`,
      source: "smoke",
    });
    const memoryCuratorRoleMemory = await request("POST", "/memories/candidates", {
      scope: "role",
      scope_id: "memory_curator",
      fact: `Memory curator role context is available (${suffix})`,
      source: "smoke",
    });
    cleanupState.memoryIds.push(ownerMemory.id, businessMemory.id, roleMemory.id, memoryCuratorRoleMemory.id);

    assert.equal(ownerMemory.scope, "owner", "owner memory was not created");
    assert.equal(businessMemory.scope, "business", "business memory was not created");
    assert.equal(roleMemory.scope, "role", "role memory was not created");

    const ownerMemories = await request("GET", "/memories?scope=owner");
    const researcherMemories = await request("GET", "/memories?scope=role&scope_id=researcher");
    assert.ok(ownerMemories.items.some((item) => item.fact.includes(suffix)), "owner memory not returned");
    assert.ok(researcherMemories.items.some((item) => item.fact.includes(suffix)), "researcher memory not returned");

    const researcherBundle = await request("POST", "/memory/bundles/resolve", {
      role_id: "researcher",
    });
    assert.ok(researcherBundle.owner.length >= 1, "researcher bundle missed owner memories");
    assert.ok(researcherBundle.business.length >= 1, "researcher bundle missed business memories");
    assert.ok(researcherBundle.role.length >= 1, "researcher bundle missed role memories");
    assert.deepEqual(researcherBundle.decisions, {
      owner: [],
      business: [],
      task: [],
    });

    const researcherIntake = await request("POST", "/telegram/intake", {
      text: `@researcher compare competitors in Varna ${suffix}`,
      topic_name: "02 Researcher",
    });
    assert.equal(researcherIntake.persisted, true, "researcher intake did not persist");
    assert.ok(researcherIntake.task && researcherIntake.run, "researcher intake did not create task and run");
    cleanupState.taskIds.push(researcherIntake.task.id);
    cleanupState.messageIds.push(researcherIntake.founder_message.id);
    cleanupState.runIds.push(researcherIntake.run.id);

    const researchTaskId = researcherIntake.task.id;
    const researchRunId = researcherIntake.run.id;
    const researchThreadId = researcherIntake.thread_id;

    const researchTaskMemory = await request("POST", "/memories/candidates", {
      scope: "task",
      scope_id: researchTaskId,
      fact: `Research task context recorded (${suffix})`,
      source: "smoke",
    });
    cleanupState.memoryIds.push(researchTaskMemory.id);

    const completedResearchRun = await request("POST", `/runs/${researchRunId}/complete`, {
      actor_agent: "researcher",
      status: "completed",
      model_used: "gemini",
      artifact_content: {
        summary: `Competitor comparison is ready (${suffix})`,
      },
    });
    assert.equal(completedResearchRun.run.status, "completed", "research run did not complete");
    assert.ok(completedResearchRun.artifact, "research artifact was not created");
    cleanupState.artifactIds.push(completedResearchRun.artifact.id);

    const orchestratorIntake = await request("POST", "/telegram/intake", {
      text: `@orchestrator assess the competitor situation ${suffix}`,
      topic_name: "General",
    });
    assert.equal(orchestratorIntake.persisted, true, "orchestrator intake did not persist");
    assert.ok(orchestratorIntake.task && orchestratorIntake.run, "orchestrator intake did not create task and run");
    cleanupState.taskIds.push(orchestratorIntake.task.id);
    cleanupState.messageIds.push(orchestratorIntake.founder_message.id);
    cleanupState.runIds.push(orchestratorIntake.run.id);

    const orchestrationTaskId = orchestratorIntake.task.id;
    const orchestrationThreadId = orchestratorIntake.thread_id;

    const orchestrationTaskMemory = await request("POST", "/memories/candidates", {
      scope: "task",
      scope_id: orchestrationTaskId,
      fact: `Orchestration task context recorded (${suffix})`,
      source: "smoke",
    });
    cleanupState.memoryIds.push(orchestrationTaskMemory.id);

    const followUp = await request("POST", "/runs/follow-up", {
      source_agent: "orchestrator",
      target_agent: "critic",
      task_id: orchestrationTaskId,
      thread_id: orchestrationThreadId,
      dispatch_reason: `Critical review is required (${suffix})`,
      handoff_message: `Review the competitor hypotheses (${suffix})`,
    });
    assert.equal(followUp.run.agent, "critic", "follow-up run target mismatch");
    assert.equal(followUp.handoff_message.to_agent, "critic", "handoff message target mismatch");
    cleanupState.runIds.push(followUp.run.id);
    cleanupState.messageIds.push(followUp.handoff_message.id);

    const criticBundle = await request("POST", "/memory/bundles/resolve", {
      role_id: "critic",
      task_id: orchestrationTaskId,
    });
    assert.ok(criticBundle.task.some((item) => item.scope_id === orchestrationTaskId), "critic bundle missed task memory");
    assert.ok(Array.isArray(criticBundle.decisions.owner), "critic bundle decisions.owner missing");
    assert.ok(Array.isArray(criticBundle.decisions.business), "critic bundle decisions.business missing");
    assert.ok(Array.isArray(criticBundle.decisions.task), "critic bundle decisions.task missing");

    const memoryCuratorBundle = await request("POST", "/memory/bundles/resolve", {
      role_id: "memory_curator",
      task_id: orchestrationTaskId,
    });
    assert.ok(memoryCuratorBundle.owner.length >= 1, "memory curator bundle missed owner memories");
    assert.ok(memoryCuratorBundle.business.length >= 1, "memory curator bundle missed business memories");
    assert.ok(memoryCuratorBundle.role.some((item) => item.scope_id === "memory_curator"), "memory curator bundle missed role memory");
    assert.ok(memoryCuratorBundle.task.some((item) => item.scope_id === orchestrationTaskId), "memory curator bundle missed task memory");
    assert.ok(Array.isArray(memoryCuratorBundle.decisions.owner), "memory curator bundle decisions.owner missing");
    assert.ok(Array.isArray(memoryCuratorBundle.decisions.business), "memory curator bundle decisions.business missing");
    assert.ok(Array.isArray(memoryCuratorBundle.decisions.task), "memory curator bundle decisions.task missing");

    console.log("Smoke suite passed for Phase 1-5");
    console.log(`Research thread: ${researchThreadId}`);
    console.log(`Orchestrator thread: ${orchestrationThreadId}`);
  } finally {
    try {
      await cleanupSmokeData();
    } finally {
      await stopChildProcess(child);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
