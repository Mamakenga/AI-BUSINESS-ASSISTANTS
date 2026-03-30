# REF LiteLLM

## What This Is

Reference card for:
1. `BerriAI/litellm`
2. a unified AI gateway and proxy layer that exposes many model providers through one OpenAI-compatible interface

Source:
1. [BerriAI/litellm](https://github.com/BerriAI/litellm)

## Why It Matters For This Project

`AI-BUSINESS-ASSISTANTS` already has:
1. a control-plane backend
2. worker-driven execution
3. a stable run/task/message lifecycle
4. an execution contract that can call an external executor endpoint

LiteLLM matters because it is one of the strongest candidates for:
1. replacing the current stub with a stable API-first execution layer
2. unifying multiple model providers behind one HTTP contract
3. enabling role-based model routing without replacing the control plane

## Main Use For This Project

Primary value:
1. **strong reference**
2. **unified model gateway**
3. **API-first execution layer**

Not the primary value:
1. orchestration framework
2. memory system
3. agent control-plane replacement

## Why It Stands Out

### 1. One Stable Contract

Why it matters:
1. the current worker already knows how to call an external execution endpoint
2. LiteLLM gives one OpenAI-compatible API for many providers
3. this reduces adapter complexity dramatically

Use in this project:
1. replace framework-specific executor hacks with one HTTP fetch
2. keep the current backend and worker model intact

### 2. Role-Based Routing

Why it matters:
1. this project already thinks in role-based execution profiles
2. model aliasing and routing fit naturally with `assistant`, `researcher`, `critic`, etc.

Use in this project:
1. map role aliases to model/provider choices
2. separate business role logic from provider-specific details

### 3. Fallbacks And Reliability

Why it matters:
1. the project needs practical reliability more than framework novelty
2. fallback logic is easier at the gateway layer than inside every role adapter

Use in this project:
1. primary/fallback routing by model alias
2. reduced executor fragility compared to CLI/plugin/proxy chains

### 4. Gateway-Level Logging And Cost Visibility

Why it matters:
1. hardening will require observability
2. model cost and routing should be visible outside ad hoc app logs

Use in this project:
1. execution monitoring
2. later cost controls and routing policy refinement

## Subscription Path vs API-First Path

The key project lesson so far:
1. subscription-backed CLI/OAuth paths can save API spend
2. but they often cost much more in engineering fragility

Practical comparison:

### Subscription path

Examples:
1. Claude Code CLI
2. Gemini CLI
3. Codex CLI

Strengths:
1. can reuse paid subscriptions
2. attractive for low direct API cost

Weaknesses:
1. multiple wrappers
2. unstable output contracts
3. plugin/proxy/auth drift
4. higher operational fragility

### API-first path

Examples:
1. LiteLLM
2. OpenRouter behind LiteLLM
3. direct provider APIs through LiteLLM

Strengths:
1. one stable HTTP contract
2. unified tool-calling format
3. built-in fallbacks and provider abstraction
4. much lower integration complexity

Weaknesses:
1. requires API keys or paid API usage
2. does not directly preserve subscription-only economics

## Strengths

1. excellent fit as a model gateway under an existing control plane
2. production-oriented
3. broad provider coverage
4. simpler integration path than CLI/plugin-based execution
5. supports role-alias routing and fallback logic

## Limits

1. not a replacement for agent orchestration
2. not a memory or learning framework
3. strongest when the project accepts API-first execution

## Fit For Current Architecture

Fit: **high**

Why:
1. current worker can already call an executor endpoint
2. project benefits from stable transport and provider abstraction
3. current backend does not need to be rethought to adopt LiteLLM

## Integration Difficulty

**Medium**

Lower than:
1. community plugin auth chains
2. multi-CLI orchestration with per-provider wrappers

## Decision Implication

Decision:
1. **Adopt as a strong reference and leading candidate**
2. seriously consider it as the default path for replacing the stub

## Practical Takeaway

For `AI-BUSINESS-ASSISTANTS`, LiteLLM is one of the strongest candidates for:
1. the next real executor layer after the stub
2. model routing and fallback handling
3. preserving the current control-plane while stabilizing model access

## Source Links

1. [BerriAI/litellm](https://github.com/BerriAI/litellm)
