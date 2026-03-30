# REF Oh My ClaudeCode

## What This Is

Reference card for:
1. `yeachan-heo/oh-my-claudecode`
2. a multi-agent orchestration layer built around Claude Code CLI

Source:
1. [yeachan-heo/oh-my-claudecode](https://github.com/yeachan-heo/oh-my-claudecode)

## Why It Matters For This Project

This project is evaluating execution layers that can preserve paid subscription access where possible.

`oh-my-claudecode` is useful because it demonstrates:
1. CLI-driven orchestration
2. multi-model dispatch ideas
3. practical patterns for invoking model CLIs programmatically

## Main Use For This Project

Primary value:
1. **practice**
2. how to call multiple CLIs programmatically
3. how to route work between CLI-backed model executors

Not the primary value:
1. adopting its full orchestration model
2. importing its agent catalog
3. replacing the current backend orchestration

## Most Relevant Areas

### 1. Programmatic CLI Invocation

Why it matters:
1. current project may move to CLI-backed executors
2. worker can potentially dispatch by role to different CLIs
3. this matches the "provider depends on role" direction

Use in this project:
1. study how Claude/Codex/Gemini CLIs are invoked
2. design a thin execution adapter over CLI tools
3. keep the existing control-plane intact

### 2. Multi-Model Dispatch

Why it matters:
1. project may route roles across GPT, Claude, and Gemini paths
2. direct CLI dispatch can preserve paid subscription value

Use in this project:
1. role-specific executor mapping
2. model routing heuristics
3. quota-aware fallback design

### 3. Token Optimization Patterns

Why it matters:
1. CLI-backed subscriptions can burn quota quickly
2. orchestration overhead must be controlled

Use in this project:
1. constrain auto-fanout
2. prefer one explicit role call = one executor run
3. use stronger models only where necessary

## Strengths

1. strong practical examples around Claude Code ecosystems
2. validates CLI-based orchestration as a real pattern
3. useful for subscription-backed multi-model execution ideas

## Limits

1. brings its own orchestration assumptions
2. includes many prebuilt agents not aligned with this project's role system
3. is heavier than needed if we only want a thin executor adapter
4. optimized for Claude Code UX, not for a clean server-side control-plane contract

## Fit For Current Architecture

Fit: **medium as an implementation reference, low as a full framework replacement**

Best current use:
1. learn how to invoke `Claude`, `Codex`, and `Gemini` CLIs programmatically
2. borrow CLI dispatch patterns
3. avoid importing the whole orchestration layer

## Integration Difficulty

**Low-medium** if used as a reference for a thin CLI adapter  
**High** if adopted wholesale as the executor framework

## Decision Implication

Decision:
1. **Adopt as a practical reference**
2. **Do not adopt as the main orchestration framework**

## Practical Takeaway

What to study from `oh-my-claudecode`:
1. programmatic CLI calls
2. multi-model CLI routing
3. quota-aware execution patterns

What not to copy directly:
1. full team orchestration model
2. predefined agent system
3. CLI-centric UX assumptions

## Source Links

1. [yeachan-heo/oh-my-claudecode](https://github.com/yeachan-heo/oh-my-claudecode)
