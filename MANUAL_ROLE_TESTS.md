# Manual Role Tests

This file is the canonical manual validation runbook for already implemented roles and scheduled jobs in `AI-BUSINESS-ASSISTANTS`.

It exists for one reason:
1. automated smoke proves the execution path works;
2. manual tests prove the replies are role-aligned, honest, and useful.

Use this file after deploy or before hardening changes.

## 1. Preconditions

Before manual tests:
1. `ops-api.service`, `ops-telegram.service`, `ops-worker.service`, and `ops-litellm.service` are healthy
2. `npm run smoke:ops-preflight` passed on VPS
3. `npm run smoke:ops-stack` passed on VPS
4. `AI_KiberOne чат` is the active supergroup
5. role topics are present and bound at least once:
   - `01 Assistant`
   - `02 Researcher`
   - `04 Finance`
   - `05 Critic`
6. `03 Methodist` is intentionally outside the standard live sweep until the first confirmed live methodist dispatch is recorded

## 2. What Good Looks Like

For every manual test, check:
1. the reply stays inside the intended role
2. the reply is in Russian
3. the reply does not ask unnecessary follow-up questions
4. if evidence is limited, the reply says so directly
5. the reply does not invent market facts, finance facts, or internal state
6. the reply is readable in Telegram without backend noise

## 3. Founder-Facing Role Tests

Deferred for now:
1. `methodist` is implemented at the routing/profile level, but the canonical live manual sweep should include it only after the first confirmed live methodist dispatch
2. `orchestrator` is intentionally deferred here because it needs a multi-role scenario, not a single-role prompt in one topic

### 3.1 Assistant

Telegram topic:
1. `01 Assistant`

Suggested input:
1. `@assistant что у нас сейчас самое срочное?`

Pass:
1. short, concrete operational answer
2. no invented competitor or market claims
3. if context is thin, says that directly and still gives a useful next step

### 3.2 Researcher

Telegram topic:
1. `02 Researcher`

Suggested input:
1. `@researcher есть ли у нас свежие сигналы по конкурентам в Варне?`

Pass:
1. focuses on competitor or market signals
2. does not drift into general assistant tone
3. if no confirmed signals exist, says that explicitly
4. suggests what should be escalated or checked next

### 3.3 Finance

Telegram topic:
1. `04 Finance`

Suggested input:
1. `@finance есть ли у нас сейчас финансовые аномалии или рискованные тренды по филиалам?`

Pass:
1. focuses on anomalies, numeric risk, and practical finance framing
2. does not turn into a generic weekly summary
3. if hard evidence is missing, says that explicitly
4. ends with one practical recommendation or escalation

### 3.4 Critic

Telegram topic:
1. `05 Critic`

Suggested input:
1. `@critic посмотри на нашу текущую логику weekly jobs и скажи, где слабые места`

Pass:
1. identifies contradictions, weak assumptions, or fragile reasoning
2. sounds like a skeptical reviewer, not like assistant or orchestrator
3. includes one escalation note or corrective action

## 4. Scheduled Job Tests

Run from VPS:
1. `cd /opt/ops/app`
2. `export CONTROL_API_URL=http://127.0.0.1:3300`
3. `export CONTROL_API_INTERNAL_TOKEN=$(grep "^CONTROL_API_INTERNAL_TOKEN=" /etc/ops.env | cut -d= -f2-)`

Use one job at a time:

### 4.1 Daily Brief

Command:
1. `SMOKE_JOB_TYPE=daily_founder_brief SMOKE_EXPECT_AGENT=assistant npm run smoke:job-trigger`

Pass:
1. run is created
2. delivery goes to `01 Assistant`
3. text is compact and leader-facing
4. no generic "please provide more information"

### 4.2 Weekly Digest

Command:
1. `SMOKE_JOB_TYPE=weekly_digest SMOKE_EXPECT_AGENT=assistant npm run smoke:job-trigger`

Pass:
1. leader-facing weekly overview
2. covers changes, decisions, unresolved items, risks, and next focus
3. does not invent facts when evidence is thin

### 4.3 Competitor Watch

Command:
1. `SMOKE_JOB_TYPE=competitor_watch SMOKE_EXPECT_AGENT=researcher npm run smoke:job-trigger`

Pass:
1. researcher-style market watch
2. competitor or market signals stay grounded
3. escalation targets are explicit when relevant

### 4.4 Branch Finance Review

Command:
1. `SMOKE_JOB_TYPE=branch_finance_review SMOKE_EXPECT_AGENT=finance_analyst npm run smoke:job-trigger`

Pass:
1. finance-oriented output
2. branch anomalies and risky trends are explicit
3. one practical recommendation or escalation is present

### 4.5 Weekly Risk Review

Command:
1. `SMOKE_JOB_TYPE=weekly_risk_review SMOKE_EXPECT_AGENT=critic npm run smoke:job-trigger`

Pass:
1. contradiction-focused critic output
2. weak assumptions are called out directly
3. includes one escalation note or corrective action

### 4.6 Memory Cleanup

Current contour note:
1. `memory_cleanup` is defined at the contract level, but it is **not dispatchable by the current VPS worker contour**
2. do not include it in the live manual sweep for now
3. validate it later when the service-only execution path for `memory_curator` is implemented

## 5. Failure Patterns

Treat these as failures:
1. role sounds like another role
2. reply invents concrete facts not supported by current context
3. reply asks generic clarification instead of producing the best available output
4. scheduled founder-facing jobs post to the wrong topic
5. service jobs read like executive summaries
6. a runbook step asks for a live trigger on a role that the current contour cannot dispatch

## 6. Recording Results

After a manual test sweep, record:
1. which role/job was tested
2. whether the issue is:
   - transport
   - routing
   - grounding
   - role tone
   - output structure
3. whether the fix belongs in:
   - prompt contract
   - worker/context assembly
   - routing/topic binding
   - hardening/logging
