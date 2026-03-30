# REF Awesome Harness Engineering

## What This Is

Reference card for:
1. `walkinglabs/awesome-harness-engineering`
2. the curated ecosystem around long-running, production-grade agent systems
3. harness design patterns rather than one specific runtime

Source:
1. [walkinglabs/awesome-harness-engineering](https://github.com/walkinglabs/awesome-harness-engineering)

## Why It Matters For This Project

`AI-BUSINESS-ASSISTANTS` already has:
1. a control-plane style backend
2. Telegram intake and reply loop
3. worker-driven execution
4. memory bundle resolution
5. run lifecycle tracking

What is still evolving:
1. executor strategy
2. runtime hardening
3. eval and observability discipline
4. safe long-running agent patterns

This reference is useful because it helps shape:
1. how to build reliable agent loops
2. how to manage context drift
3. how to enforce safe autonomy on VPS
4. how to evaluate agent quality over time

## Combined Practical Takeaways

These are the strongest sections for `AI-BUSINESS-ASSISTANTS`.

### 1. Foundations

Why it matters:
1. gives the production mindset from Anthropic and OpenAI
2. useful for deciding how much autonomy each role should have
3. helps avoid naive "single prompt = agent system" thinking

Use in this project:
1. shape role-worker execution policy
2. define when a role may escalate, hand off, or stop
3. refine executor contracts for long-running work

### 2. Context, Memory & Working State

Why it matters:
1. this project already has a memory layer
2. context drift and token budget are real risks in multi-step execution
3. long-running roles need deliberate state boundaries

Use in this project:
1. improve memory bundle policy
2. separate durable memory from transient run context
3. reduce prompt bloat in executor adapters

### 3. Constraints & Safe Autonomy

Why it matters:
1. workers run on a VPS and may eventually execute tools or shell actions
2. different roles should not have identical permissions
3. safe execution is part of production readiness, not a later detail

Use in this project:
1. define tool permissions by role
2. constrain future executor adapters
3. harden file/system access before broader autonomy

### 4. Specs & Workflow Design

Why it matters:
1. long-lived agent systems fail when workflow assumptions stay implicit
2. "12-Factor Agents" style guidance is directly relevant
3. role-based execution needs explicit contracts and stable interfaces

Use in this project:
1. refine runtime profiles
2. keep role responsibilities crisp
3. prevent the executor layer from leaking framework-specific assumptions into the control plane

### 5. Evals & Observability

Why it matters:
1. this will become critical in hardening
2. production agent systems need traceability, not only successful demos
3. regressions will otherwise be invisible

Use in this project:
1. Phase 9 hardening inputs
2. structured run-level logging
3. trace grading and replay-style checks
4. comparison of executors under the same prompts

## Strengths

1. strong orientation for production thinking
2. useful across frameworks and executors
3. highly relevant to long-running agent systems
4. helps separate control-plane concerns from executor concerns
5. gives a good vocabulary for memory, guardrails, and evals

## Limits

1. not a ready-to-run framework
2. does not choose the best executor for this project
3. does not provide a drop-in VPS integration
4. must be translated into concrete project artifacts and policies

## Fit For Current Architecture

Fit: **high as a principles reference**

Why:
1. current backend is already framework-agnostic enough to benefit from harness ideas
2. project is actively deciding between execution backends
3. memory, routing, and worker loops already exist and need hardening discipline

## Integration Difficulty

**Low** as a reference source  
**Medium** if we translate its ideas into project rules, evals, and runtime safeguards

## Decision Implication

Decision:
1. **Adopt as a reference source**
2. **Do not treat as implementation canon**

Recommended use:
1. mine it for principles
2. turn validated lessons into:
   - runtime policy
   - eval checklists
   - observability requirements
   - executor comparison criteria

## Immediate Relevance To AI-BUSINESS-ASSISTANTS

Most useful right now:
1. Foundations
2. Context, Memory & Working State
3. Constraints & Safe Autonomy
4. Specs & Workflow Design

Best saved for later hardening:
1. Evals & Observability

## Suggested Follow-Up Cards

1. `REF_Claude_Code_CLI.md`
2. `REF_Subscription_Auth_Paths.md`
3. `REF_Executor_Selection_Criteria.md`

## Source Links

1. [walkinglabs/awesome-harness-engineering](https://github.com/walkinglabs/awesome-harness-engineering)
