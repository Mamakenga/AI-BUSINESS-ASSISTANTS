# OpenClaw Execution Adapter: Problem And Options

## Purpose

This note fixes one practical question before the first live founder demo:

How should `AI-BUSINESS-ASSISTANTS` execute role runs through a separate OpenClaw contour without reusing the old Stemford or Jarvis runtime directly?

## Problem

The current project already has:
1. Telegram bridge
2. Control API
3. role worker
4. reply delivery back to Telegram

But the worker still needs a real execution backend.

At the same time, we explicitly decided:
1. do not reuse the old Stemford contour as a dependency
2. do not mix the new system with the historical Jarvis runtime
3. build a separate OpenClaw contour for this project

## What Was Checked

Based on the official OpenClaw docs and the old Jarvis reference:
1. OpenClaw clearly works as a runtime layer
2. OpenClaw has Gateway and agent-loop entry points
3. there is no simple, obvious built-in REST contract like `POST /execute` that matches the current worker contract out of the box

So the gap is not "can OpenClaw run agents?"

The real gap is:
How do we expose that execution in a simple and stable way for the current worker?

## Option A: Thin Adapter Over OpenClaw CLI

### Idea

Build a very small local service for this project:
1. receive HTTP request from the worker
2. call OpenClaw CLI locally
3. wait for the result
4. return normalized response

### Pros

1. shortest path to first live demo
2. easy to debug
3. fewer unknowns
4. keeps current worker contract simple
5. does not require deep Gateway integration on day one

### Cons

1. every execution starts a process
2. not the cleanest long-term architecture
3. may later be replaced by a more native runtime path

## Option B: Thin Adapter Over OpenClaw Gateway RPC

### Idea

Build a small local service that:
1. receives HTTP request from the worker
2. talks to a running OpenClaw Gateway
3. starts agent execution through the Gateway path
4. returns normalized response

### Pros

1. cleaner long-term integration
2. closer to native OpenClaw runtime behavior
3. easier to evolve later if the contour grows

### Cons

1. more integration uncertainty right now
2. harder to debug for the first rollout
3. higher risk of slowing down the first visible result in Telegram

## What Should Not Be Done

For this project, we should not:
1. reuse the old Stemford runtime directly
2. bind the new system to the historical Jarvis contour
3. delay the first founder demo until a perfect native integration is ready

## Recommendation

For the first live vertical slice, use:

`Thin adapter over OpenClaw CLI`

Reason:
1. it is the fastest path to a real founder-visible result
2. it keeps the current worker contract intact
3. it preserves contour isolation
4. it can later be replaced internally with Gateway RPC without changing the outer contract

## Decision Shape For The New Contour

1. each role keeps its own `primary_model` and `fallback_models[]`
2. any provider may be the primary route if that is the best fit for the role
3. model routing stays role-specific, not provider-dogmatic
4. execution backend should stay replaceable behind one adapter contract

## Next Step

1. create a separate OpenClaw execution contour for `AI-BUSINESS-ASSISTANTS`
2. implement the first adapter as `CLI-first`
3. plug worker -> adapter -> OpenClaw
4. use that path for the first live Telegram demo
