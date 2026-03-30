# References

This folder is the curated reference library for `AI-BUSINESS-ASSISTANTS`.

Use it for:
1. external frameworks and runtimes we may adopt
2. auth and provider paths we may rely on
3. production patterns for long-running agents
4. evals, observability, and deploy references

Do not use this folder for:
1. accepted project decisions
2. active implementation plans
3. temporary scratch notes

Those belong in:
1. `IMPLEMENTATION_CHECKLIST.md`
2. `OPENCLAW_EXECUTION_ADAPTER_OPTIONS.md`
3. future decision logs or plan files

## Folder Map

1. `01-principles/` - long-running agent design, harness engineering, guardrails
2. `02-executors/` - candidate execution layers like OpenClaw, Claude Code CLI, LangGraph
3. `03-auth-and-providers/` - OAuth, API, OpenRouter, subscription-backed provider paths
4. `04-evals-and-observability/` - evals, traces, monitoring, regression checks
5. `05-ops-and-runtime/` - VPS, process model, systemd, topology, runtime operations

## File Naming

Use:
1. `REF_<topic>.md` for a focused reference card
2. one file per framework or topic

Examples:
1. `REF_Claude_Code_CLI.md`
2. `REF_OpenClaw.md`
3. `REF_Harness_Engineering.md`
4. `REF_Subscription_Auth_Paths.md`

## Reference Card Template

Each `REF_*.md` should answer:
1. What this is
2. Why it matters for this project
3. Strengths
4. Limits
5. Fit for current control-plane architecture
6. Integration difficulty: low / medium / high
7. Decision implication: adopt / keep as option / reject
8. Source links

## Working Rule

This folder is for orientation and comparison.

If a reference changes the project direction:
1. summarize the conclusion in a project decision artifact
2. update `START_HERE.md` or the relevant checklist only if the reference becomes part of the active canon
