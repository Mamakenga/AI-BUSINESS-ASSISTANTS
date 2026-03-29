"use strict";

const crypto = require("node:crypto");
const { resolveTelegramRouting } = require("./telegram-routing");

function normalizeText(value) {
  return String(value || "").trim();
}

function defaultIdFactory(prefix) {
  return `${prefix}_${crypto.randomUUID()}`;
}

function stripLeadingRoleTag(text) {
  return normalizeText(text).replace(/^@[a-z_]+\s*/i, "").trim();
}

function deriveTaskTitle(text, maxLength = 120) {
  let title = stripLeadingRoleTag(text).replace(/\s+/g, " ").trim();
  title = title.replace(/[?!.\s]+$/g, "").trim();

  if (!title) {
    title = "Founder request";
  }

  if (title.length <= maxLength) {
    return title;
  }

  return `${title.slice(0, maxLength - 3).trimEnd()}...`;
}

function buildTelegramIntakePlan(input, options = {}) {
  const route = resolveTelegramRouting(input);

  if (route.needs_clarification) {
    return {
      route,
      should_persist: false,
      thread_id: null,
      task: null,
      founder_message: null,
      run: null,
    };
  }

  const idFactory = options.idFactory || defaultIdFactory;
  const threadId = idFactory("thread");
  const taskId = route.should_create_task ? idFactory("task") : null;

  return {
    route,
    should_persist: true,
    thread_id: threadId,
    task: route.should_create_task
      ? {
          id: taskId,
          title: deriveTaskTitle(route.text),
          status: "inbox",
          assigned_role: route.resolved_role,
          priority: "medium",
          due_at: null,
          thread_id: threadId,
          board_order: 0,
        }
      : null,
    founder_message: {
      thread_id: threadId,
      task_id: taskId,
      from_agent: "founder",
      to_agent: route.resolved_role,
      message_type: "request",
      content: route.text,
      status: "unread",
    },
    run: {
      agent: route.resolved_role,
      task_id: taskId,
      thread_id: threadId,
      status: "pending",
    },
  };
}

module.exports = {
  buildTelegramIntakePlan,
  deriveTaskTitle,
};
