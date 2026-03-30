# REF Memento Skills

## What This Is

Reference card for:
1. `Memento-Teams/Memento-Skills`
2. a self-evolving agent framework built around persistent skill memory and reflective improvement

Source:
1. [Memento-Teams/Memento-Skills](https://github.com/Memento-Teams/Memento-Skills)

## Why It Matters For This Project

`AI-BUSINESS-ASSISTANTS` is already building:
1. role-based execution
2. persistent memory
3. run/task/message lifecycle
4. reusable operational patterns

Memento-Skills matters not because it is the next executor candidate, but because it focuses on a deeper question:
1. how agents learn from deployment experience
2. how skills become durable reusable capability
3. how failures improve the system over time

## Main Use For This Project

Primary value:
1. **learning/skills architecture**
2. reflective improvement loops
3. skill retrieval and maintenance patterns

Not the primary value:
1. immediate executor replacement
2. short-path runtime swap

## Most Relevant Ideas

### 1. Read -> Execute -> Reflect -> Write

Why it matters:
1. this is a clean model for post-run learning
2. it turns failures into structured improvement signals
3. it separates "running the agent" from "improving the agent"

Use in this project:
1. future post-run review loop
2. skill improvement after failed or weak runs
3. memory-to-skill promotion logic

### 2. Skills As First-Class Capability Units

Why it matters:
1. not all knowledge should stay in prompts or memories
2. some repeated successful patterns should become reusable skills
3. this is relevant for role-specific execution patterns

Use in this project:
1. role playbooks
2. reusable task archetypes
3. future curated skill library per role

### 3. Retrieval Becomes A Core Problem

Why it matters:
1. large skill libraries become noisy
2. capability growth without retrieval discipline causes chaos
3. the same risk exists for memory and executor prompts

Use in this project:
1. future skill routing strategy
2. memory bundle selection discipline
3. separation between active context and archived capability

### 4. Learning From Failure

Why it matters:
1. retries alone are not enough
2. the system should identify what failed and why
3. improvement should be attached to concrete capability units

Use in this project:
1. hardening phase
2. run review pipeline
3. future automatic or semi-automatic role prompt refinement

## Strengths

1. strong conceptual model for self-improving agent systems
2. useful distinction between execution and learning
3. directly relevant to future skills-layer design
4. helpful for thinking beyond prompt-only adaptation

## Limits

1. too large a shift for the current executor decision
2. brings a full framework and its own state model
3. not the shortest path for replacing the current stub

## Fit For Current Architecture

Fit: **high as a strategic reference, low as the next runtime replacement**

Best current use:
1. inspire future learning/skills layer design
2. inform how successful patterns should be promoted from transient runs into reusable capability

## Integration Difficulty

**High** as a direct framework adoption  
**Low-medium** as a design reference

## Decision Implication

Decision:
1. **Adopt as a strategic reference**
2. **Do not adopt now as the execution framework**

## Practical Takeaway

What to keep from Memento-Skills:
1. learning from deployment experience
2. reflective write-back loops
3. skill repair and regeneration
4. durable capability as something more structured than raw memory

What not to do right now:
1. replace the current control-plane with Memento-Skills
2. treat it as the next executor swap

## Source Links

1. [Memento-Teams/Memento-Skills](https://github.com/Memento-Teams/Memento-Skills)
