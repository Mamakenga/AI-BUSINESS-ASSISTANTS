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

      facts.push(fact);
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

      facts.push(decision);
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
      "5. Never quote raw memory labels or internal scope tags such as [owner], [business], [role], [task], or [decision:*]; rewrite them into natural user-facing language.",
      "6. Never mention internal record ids, UUIDs, memory ids, or database-style identifiers in the user-facing answer.",
    ].join("\n")
  );

  if (requestType === "direct-answer") {
    sections.push(
      [
        "Direct-answer rules:",
        "1. Do not ask generic follow-up questions if the founder already asked a concrete question.",
        "2. Use the available context, memory, and recent thread state to produce the best answer you can right now.",
        "3. If evidence is thin, say that directly and still provide the best available answer plus one concrete next step.",
        "4. Do not end the answer with a request to clarify the whole situation, restate the project, or provide a broad task list.",
      ].join("\n")
    );
  }

  if (requestType === "direct-answer" && roleId === "assistant") {
    sections.push(
      [
        "Assistant direct-answer rules:",
        "1. If the founder asks what is urgent, current, or important now, answer from the available context instead of asking for a broad project restatement.",
        "2. If the current state is unclear, say that the confirmed context is limited and give the safest practical next step.",
        "3. For urgency questions, use a compact structure: a) what is confirmed right now, b) what is unclear, c) the safest next action.",
      ].join("\n")
    );
  }

  if (requestType === "direct-answer" && roleId === "researcher") {
    sections.push(
      [
        "Researcher direct-answer rules:",
        "1. If the founder asks for fresh competitor or market signals, answer from the available evidence instead of asking for a broad research brief.",
        "2. If no fresh confirmed signals exist, say that directly.",
        "3. Use a compact structure: a) confirmed signals, b) what remains unconfirmed, c) one focused next research step.",
        "4. Even when fresh confirmed signals are absent, still include b) what remains unconfirmed and c) one focused next research step instead of stopping after a single sentence.",
      ].join("\n")
    );
  }

  if (requestType === "direct-answer" && roleId === "finance_analyst") {
    sections.push(
      [
        "Finance direct-answer rules:",
        "1. If the founder asks about financial anomalies, risks, or warning signs, answer from the available numbers, memory, and recent evidence instead of asking for a full finance brief.",
        "2. If confirmed financial evidence is limited, say that directly.",
        "3. Use a compact structure: a) what is confirmed in the available financial picture, b) what remains unclear or unconfirmed, c) one safest next finance check or action.",
        "4. Even when confirmed financial evidence is absent, still include b) what remains unclear or unconfirmed and c) one safest next finance check or action instead of stopping after a clarification request.",
      ].join("\n")
    );
  }

  if (requestType === "direct-answer" && roleId === "critic") {
    sections.push(
      [
        "Critic direct-answer rules:",
        "1. If the founder asks about weaknesses, contradictions, or risky assumptions, answer from the available evidence, memory, and recent handoffs instead of inventing a broad strategic audit.",
        "2. If confirmed evidence is limited, say that directly.",
        "3. Use a compact structure: a) what is confirmed as a weak point, contradiction, or fragile assumption, b) what remains unverified or unclear, c) one short safest verification step or corrective action.",
        "4. Even when confirmed evidence is absent, still include b) what remains unverified or unclear and c) one short safest verification step or corrective action instead of inventing detailed business risks.",
        "5. Do not turn c) into a long intake questionnaire, multi-step audit plan, or checklist for filling the whole business profile.",
      ].join("\n")
    );
  }

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
