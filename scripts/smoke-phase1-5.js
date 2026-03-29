"use strict";

const { spawn } = require("node:child_process");
const path = require("node:path");
const process = require("node:process");

const DATABASE_URL = process.env.DATABASE_URL || "";

if (!DATABASE_URL) {
  throw new Error("DATABASE_URL is required");
}

const PORT = Number.parseInt(process.env.SMOKE_PORT || "3100", 10);
const BASE_URL = `http://127.0.0.1:${PORT}`;
const suffix = Date.now().toString(36);
const appPath = path.join(__dirname, "..", "src", "server.js");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function request(method, pathname, body) {
  const response = await fetch(`${BASE_URL}${pathname}`, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
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

async function main() {
  const child = spawn(process.execPath, [appPath], {
    cwd: path.join(__dirname, ".."),
    env: {
      ...process.env,
      PORT: String(PORT),
      DATABASE_URL,
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
    assert(health.service === "control-api", "health endpoint returned unexpected service");

    const ownerMemory = await request("POST", "/memories/candidates", {
      scope: "owner",
      fact: `Максим предпочитает короткие ответы (${suffix})`,
      source: "smoke",
    });
    const businessMemory = await request("POST", "/memories/candidates", {
      scope: "business",
      fact: `3 филиала активны (${suffix})`,
      source: "smoke",
    });
    const roleMemory = await request("POST", "/memories/candidates", {
      scope: "role",
      scope_id: "researcher",
      fact: `Последний ресерч обновлён (${suffix})`,
      source: "smoke",
    });

    assert(ownerMemory.scope === "owner", "owner memory was not created");
    assert(businessMemory.scope === "business", "business memory was not created");
    assert(roleMemory.scope === "role", "role memory was not created");

    const ownerMemories = await request("GET", "/memories?scope=owner");
    const researcherMemories = await request("GET", "/memories?scope=role&scope_id=researcher");
    assert(ownerMemories.items.some((item) => item.fact.includes(suffix)), "owner memory not returned");
    assert(researcherMemories.items.some((item) => item.fact.includes(suffix)), "researcher memory not returned");

    const researcherBundle = await request("POST", "/memory/bundles/resolve", {
      role_id: "researcher",
    });
    assert(researcherBundle.owner.length >= 1, "researcher bundle missed owner memories");
    assert(researcherBundle.business.length >= 1, "researcher bundle missed business memories");
    assert(researcherBundle.role.length >= 1, "researcher bundle missed role memories");
    assert(researcherBundle.decisions === undefined || researcherBundle.decisions.owner.length === 0, "researcher bundle should not include decisions");

    const researcherIntake = await request("POST", "/telegram/intake", {
      text: `@researcher сравни конкурентов в Варне ${suffix}`,
      topic_name: "02 Researcher",
    });
    assert(researcherIntake.persisted === true, "researcher intake did not persist");
    assert(researcherIntake.task && researcherIntake.run, "researcher intake did not create task and run");

    const researchTaskId = researcherIntake.task.id;
    const researchRunId = researcherIntake.run.id;
    const researchThreadId = researcherIntake.thread_id;

    await request("POST", "/memories/candidates", {
      scope: "task",
      scope_id: researchTaskId,
      fact: `Задача исследователя в работе (${suffix})`,
      source: "smoke",
    });

    const completedResearchRun = await request("POST", `/runs/${researchRunId}/complete`, {
      actor_agent: "researcher",
      status: "completed",
      model_used: "gemini",
      artifact_content: {
        summary: `Сравнение конкурентов готово (${suffix})`,
      },
    });
    assert(completedResearchRun.run.status === "completed", "research run did not complete");
    assert(completedResearchRun.artifact, "research artifact was not created");

    const orchestratorIntake = await request("POST", "/telegram/intake", {
      text: `@orchestrator оцени конкурентную ситуацию ${suffix}`,
      topic_name: "General",
    });
    assert(orchestratorIntake.persisted === true, "orchestrator intake did not persist");
    assert(orchestratorIntake.task && orchestratorIntake.run, "orchestrator intake did not create task and run");

    const orchestrationTaskId = orchestratorIntake.task.id;
    const orchestrationThreadId = orchestratorIntake.thread_id;

    await request("POST", "/memories/candidates", {
      scope: "task",
      scope_id: orchestrationTaskId,
      fact: `Контекст orchestration-задачи записан (${suffix})`,
      source: "smoke",
    });

    const followUp = await request("POST", "/runs/follow-up", {
      source_agent: "orchestrator",
      target_agent: "critic",
      task_id: orchestrationTaskId,
      thread_id: orchestrationThreadId,
      dispatch_reason: `Нужна критическая проверка (${suffix})`,
      handoff_message: `Проверь гипотезы по конкурентам (${suffix})`,
    });
    assert(followUp.run.agent === "critic", "follow-up run target mismatch");
    assert(followUp.handoff_message.to_agent === "critic", "handoff message target mismatch");

    const criticBundle = await request("POST", "/memory/bundles/resolve", {
      role_id: "critic",
      task_id: orchestrationTaskId,
    });
    assert(criticBundle.task.some((item) => item.scope_id === orchestrationTaskId), "critic bundle missed task memory");
    assert(Array.isArray(criticBundle.decisions.owner), "critic bundle decisions.owner missing");
    assert(Array.isArray(criticBundle.decisions.business), "critic bundle decisions.business missing");
    assert(Array.isArray(criticBundle.decisions.task), "critic bundle decisions.task missing");

    console.log("Smoke suite passed for Phase 1-5");
    console.log(`Research thread: ${researchThreadId}`);
    console.log(`Orchestrator thread: ${orchestrationThreadId}`);
  } finally {
    if (!child.killed) {
      child.kill("SIGTERM");
      await sleep(500);
      if (!child.killed) {
        child.kill("SIGKILL");
      }
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
