"use strict";

const CHARS_PER_TOKEN = 4;
const FIXED_SCAFFOLDING_TOKEN_CEILING = 1000;
const MEMORY_BUDGET_TOKENS = 500;
const HANDOFF_BUDGET_TOKENS = 200;

function normalizeOptionalString(value) {
  if (value === undefined || value === null) {
    return null;
  }

  const normalized = String(value).trim();
  return normalized.length > 0 ? normalized : null;
}

function toCharBudget(tokens) {
  return tokens * CHARS_PER_TOKEN;
}

function truncateString(value, maxChars) {
  const normalized = normalizeOptionalString(value);
  if (!normalized) {
    return null;
  }

  if (normalized.length <= maxChars) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(0, maxChars - 3)).trimEnd()}...`;
}

function deriveRequestType(executionContext) {
  if (executionContext?.role?.execution_mode === "multi_role_router") {
    return "orchestration";
  }

  if (executionContext?.run?.requested_by_agent === "scheduler") {
    return "task-execution";
  }

  if (executionContext?.run?.task_id) {
    return "task-execution";
  }

  return "direct-answer";
}

function buildMemoryFacts(memoryBundle) {
  if (!memoryBundle || typeof memoryBundle !== "object") {
    return [];
  }

  const facts = [];
  const scopeOrder = ["owner", "business", "role", "task"];

  for (const scope of scopeOrder) {
    const items = Array.isArray(memoryBundle[scope]) ? memoryBundle[scope] : [];
    for (const item of items) {
      const fact = normalizeOptionalString(item?.fact);
      if (!fact) {
        continue;
      }

      facts.push(`[${scope}] ${fact}`);
    }
  }

  const decisions = memoryBundle.decisions && typeof memoryBundle.decisions === "object" ? memoryBundle.decisions : {};
  for (const scope of ["owner", "business", "task"]) {
    const items = Array.isArray(decisions[scope]) ? decisions[scope] : [];
    for (const item of items) {
      const decision = normalizeOptionalString(item?.decision);
      if (!decision) {
        continue;
      }

      facts.push(`[decision:${scope}] ${decision}`);
    }
  }

  return facts;
}

function trimBulletList(items, maxChars) {
  const lines = [];
  let usedChars = 0;

  for (const item of items) {
    const normalized = normalizeOptionalString(item);
    if (!normalized) {
      continue;
    }

    const line = `- ${normalized}`;
    const addition = lines.length === 0 ? line.length : line.length + 1;
    if (usedChars + addition > maxChars) {
      break;
    }

    lines.push(line);
    usedChars += addition;
  }

  return lines;
}

function buildSystemPrompt(executionContext) {
  if (!executionContext || typeof executionContext !== "object") {
    throw new Error("executionContext is required");
  }

  const roleId = normalizeOptionalString(executionContext?.role?.id);
  if (!roleId) {
    throw new Error("executionContext.role.id is required");
  }

  const outputContract = normalizeOptionalString(executionContext?.role?.output_contract);
  const executionMode = normalizeOptionalString(executionContext?.role?.execution_mode) || "single_role_worker";
  const requestType = deriveRequestType(executionContext);

  const sections = [];
  sections.push("You are a role inside the AI-BUSINESS-ASSISTANTS execution layer.");
  sections.push(`Role id: ${roleId}`);
  sections.push(`Execution mode: ${executionMode}`);
  sections.push(`Request type: ${requestType}`);

  if (outputContract) {
    sections.push(`Output contract: ${outputContract}`);
  }

  sections.push(
    [
      "Response rules:",
      "1. Reply in Russian.",
      "2. Stay within the assigned role.",
      "3. Keep the answer useful and concrete.",
      "4. If context is insufficient, say what is missing instead of inventing facts.",
    ].join("\n")
  );

  if (executionContext?.run?.requested_by_agent === "scheduler") {
    sections.push(
      [
        "Scheduled-run rules:",
        "1. Do not ask follow-up questions.",
        "2. Produce the best possible result from the available context.",
        "3. If fresh information is limited, say that explicitly and still provide a usable output.",
      ].join("\n")
    );
  }

  if (executionContext.task) {
    const taskLines = [
      "Current task:",
      `- id: ${executionContext.task.id}`,
      `- title: ${truncateString(executionContext.task.title, 300) || "n/a"}`,
      `- status: ${executionContext.task.status || "n/a"}`,
      `- priority: ${executionContext.task.priority || "n/a"}`,
    ];
    sections.push(taskLines.join("\n"));
  }

  const handoffLines = trimBulletList(
    (executionContext.handoff_messages || [])
      .slice(-2)
      .reverse()
      .map((message) => {
        const content = truncateString(message.content, toCharBudget(HANDOFF_BUDGET_TOKENS));
        if (!content) {
          return null;
        }
        return `${message.from_agent || "unknown"}: ${content}`;
      })
      .filter(Boolean),
    toCharBudget(HANDOFF_BUDGET_TOKENS)
  );

  if (handoffLines.length > 0) {
    sections.push(["Recent handoffs:", ...handoffLines].join("\n"));
  }

  const memoryFacts = buildMemoryFacts(executionContext.memory_bundle);
  const memoryLines = trimBulletList(memoryFacts, toCharBudget(MEMORY_BUDGET_TOKENS));
  if (memoryLines.length > 0) {
    sections.push(["Memory bundle:", ...memoryLines].join("\n"));
  }

  const prompt = truncateString(sections.join("\n\n"), toCharBudget(FIXED_SCAFFOLDING_TOKEN_CEILING)) || "";

  return {
    prompt,
    meta: {
      request_type: requestType,
      memory_fact_count: memoryLines.length,
      handoff_count: handoffLines.length,
    },
  };
}

function buildUserPrompt(executionContext) {
  const founderRequest = truncateString(executionContext?.founder_request, 4000);
  if (founderRequest) {
    return founderRequest;
  }

  const taskTitle = truncateString(executionContext?.task?.title, 2000);
  if (taskTitle) {
    return `Task: ${taskTitle}`;
  }

  return "Provide the best possible role-aligned response for the current run.";
}

function buildExecutionMessages(executionContext) {
  const systemPrompt = buildSystemPrompt(executionContext);

  return {
    system_prompt: systemPrompt.prompt,
    prompt_meta: systemPrompt.meta,
    user_prompt: buildUserPrompt(executionContext),
    messages: [
      {
        role: "system",
        content: systemPrompt.prompt,
      },
      {
        role: "user",
        content: buildUserPrompt(executionContext),
      },
    ],
  };
}

module.exports = {
  FIXED_SCAFFOLDING_TOKEN_CEILING,
  HANDOFF_BUDGET_TOKENS,
  MEMORY_BUDGET_TOKENS,
  buildExecutionMessages,
  buildSystemPrompt,
  deriveRequestType,
};
