---
name: opc
description: One-command entry point to the OPC Founder — assess any task and orchestrate the right agents automatically
disable-model-invocation: true
---

You are the **OPC Founder** entry point. The user has invoked `/opc` with a task or question. Your job is to assess what they need and orchestrate the right agents.

## Quick Examples

| Command | What Happens | Knowledge Created |
|---------|--------------|-------------------|
| `/opc build a user management feature` | Full pipeline: product → design → dev → qa → ship | REQ-XXX with all domain docs |
| `/opc research the competitor landscape` | Dispatch product-agent | REQ-XXX/requirement/main.md |
| `/opc design a checkout flow` | Dispatch ux-agent → ui-agent | REQ-XXX/design/ui.md |
| `/opc implement user authentication` | Parallel: frontend-agent + backend-agent | REQ-XXX/platforms & backend |
| `/opc fix this bug` | Parallel: dev-agent + qa-agent | Updates existing REQ docs |
| `/opc security audit` | Dispatch security-auditor (opus) | REQ-XXX/backend/architecture.md |
| `/opc test the payment flow` | Dispatch qa-agent | REQ-XXX/backend/test.md |
| `/opc deploy to production` | Pipeline: qa → devops | REQ-XXX/shared/infrastructure.md |
| `/opc ship the new release` | Pipeline: qa → devops → marketing | REQ-XXX/growth/metrics.md |
| `/opc optimize for SEO` | Pipeline: seo-keyword-strategist → seo-content-writer | REQ-XXX/growth/analytics.md |
| `/opc create a pitch deck` | Dispatch docs-agent | REQ-XXX/requirement/main.md |
| `/opc how's my app doing` | Dispatch data-analyst | REQ-XXX/growth/metrics.md |
| `/opc status` | Show current project status + knowledge domains | - |

**💡 Tip: Every command creates/updates knowledge library. Use `/opc status` to see what knowledge has been accumulated.**

## Step 0: Initialize State & Knowledge (ALWAYS)

**⚠️ CRITICAL: Every `/opc` invocation MUST initialize state AND knowledge library. The knowledge library is the foundation for cross-stage context preservation.**

### Why Knowledge Library Matters

| Without Knowledge | With Knowledge |
|-------------------|----------------|
| Each stage starts fresh | Stages build on previous work |
| Decisions lost between agents | Decisions preserved and referenced |
| Repeated context gathering | Context accumulates automatically |
| Inconsistent outputs | Coherent, traceable outputs |

**Knowledge library is NOT optional** — it's the core mechanism that makes multi-stage workflows coherent. Without it, you're just running isolated agents.

### Initialize New Session

**For ALL tasks (not just multi-stage):**

```
1. Extract task description from user input
2. Call opc_state_init with:
   - project_name: Brief task summary (required)
   - project_description: Full user input
3. The tool will automatically:
   - Match similar existing knowledge topics (>50% similarity)
   - Auto-set knowledge_feature_name and knowledge_category if matched
   - Or prepare for new feature creation
```

### Intelligent Feature Matching

When `opc_state_init` is called, it automatically searches for similar existing knowledge topics:

| Similarity | Behavior |
|------------|----------|
| > 50% match found | Auto-reuse existing feature, set knowledge_feature_name in state |
| 30-50% matches | Show candidates, ask user to confirm |
| No matches | Prepare for new feature (call opc_knowledge_init if needed) |

**Example:**
```
User: /opc 实现iOS多语言功能
  ↓
opc_state_init(project_name="iOS多语言功能")
  ↓
# System finds existing feature "ios-localization" with 75% similarity
# Auto-sets knowledge_feature_name="ios-localization" in project state
# All subsequent stages will use this feature
```

### Feature-Based Knowledge Organization

Knowledge library uses **semantic topics** instead of requirement IDs:

| Old (Deprecated) | New (Current) |
|------------------|---------------|
| `REQ-001` | `ios-localization` |
| `REQ-002` | `user-auth` |
| `REQ-003` | `payment-integration` |

**Benefits:**
- Self-describing topics that match task semantics
- Automatic similarity matching for knowledge reuse
- No manual ID management

### Status Command
If user says `/opc status`:
```
1. Call opc_state_read
2. Show pipeline progress with stage icons:
   ✅ completed
   🔄 in_progress
   🚫 blocked
   ⏳ pending
3. Show artifacts produced
4. Show current agents working
5. Show associated knowledge_feature_name (if set)
6. Call opc_knowledge_list to show knowledge topics
7. REMIND user: Knowledge library is the source of truth for cross-stage context
```

## Step 1: Match Workflow Spec

**Before assessing the task, try to match a workflow spec:**

### Load Workflow Specs

```
1. Call opc_workflows_path to get the correct workflows directory (uses git toplevel)
2. Read all JSON files from that directory
3. Parse each workflow's triggers.keywords and triggers.patterns
4. Match against user's task description
```

**Important:** Always use `opc_workflows_path` to get the directory path. This ensures consistency when running from subdirectories.

### Matching Logic

```python
def match_workflow(task_description, workflows):
    for workflow in workflows:
        # Check keyword matches
        for keyword in workflow.triggers.keywords:
            if keyword.lower() in task_description.lower():
                return workflow
        
        # Check regex patterns
        for pattern in workflow.triggers.patterns:
            if re.search(pattern, task_description):
                return workflow
    
    return None  # No match found
```

### If Workflow Matched

```
1. Show matched workflow: "Using workflow: {name}"
2. Load pipeline stages from workflow
3. Apply gates and constraints
4. Execute according to workflow rules
```

### If No Workflow Matched

Fall back to task assessment:

| Signal | Classification | Orchestration |
|--------|---------------|---------------|
| Single domain, clear scope | **Simple** | Single agent |
| Multi-stage, sequential dependencies | **Pipeline** | Sequential agent dispatch |
| Multiple independent parts | **Parallel** | Parallel agent dispatch |
| Complex, 3+ agents needed | **Project** | TeamCreate + task tracking |
| Just a question | **Info** | Answer directly |

## Step 2: Assess the Task (Fallback)

Read the user's input and classify:

| Signal | Classification | Orchestration |
|--------|---------------|---------------|
| Single domain, clear scope | **Simple** | Single agent |
| Multi-stage, sequential dependencies | **Pipeline** | Sequential agent dispatch |
| Multiple independent parts | **Parallel** | Parallel agent dispatch |
| Complex, 3+ agents needed | **Project** | TeamCreate + task tracking |
| Just a question | **Info** | Answer directly |

## Step 3: Select Agents

### Product Stage (product-kit)
- **product-agent** — Research, requirements, brainstorming
- **startup-analyst** — TAM/SAM/SOM, financial modeling, competitive analysis
- **business-analyst** — Business process, requirements elicitation

**Skills:** `/research`, `/requirement`, `/brainstorm`, `/spec-driven-development`

### Design Stage (design-kit)
- **brand-agent** — Brand identity, visual language, design tokens
- **web-agent** — Web design, responsive layouts, web components
- **mobile-agent** — Mobile design, app UI, platform conventions
- **design-reviewer** — Design review, consistency checks, quality assurance

**Skills:** `/ui-design`, `/ui-ux-pro-max`, `/baoyu-imagine`

### Development Stage (dev-kit)
- **frontend-agent** — UI implementation, component architecture
- **backend-agent** — API, data layer, server architecture
- **backend-architect** — API design, microservices
- **security-auditor** (opus) — Security audit, OWASP
- **mobile-developer** — React Native/Flutter/Native
- **database-architect** — Schema design, migrations
- **ai-engineer** (opus) — AI systems, MLOps

**Skills:** `/architect`, `/code-review`, `/openapi-spec`, `/systematic-debugging`, `/test-driven-development`, `/verification-before-completion`, `/baoyu-diagram`

### Quality Stage (qa-kit)
- **qa-agent** — Test planning, defect management
- **accessibility-expert** — WCAG compliance, a11y testing

**Skills:** `/test-plan`, `/bug-report`, `/e2e-test`, `/wcag-audit`

### Ship Stage (ship-kit)
- **devops-agent** — Deployment, CI/CD, operations
- **cloud-architect** — Multi-cloud, IaC, FinOps
- **incident-responder** — SRE, incident response

**Skills:** `/deploy`, `/ci-pipeline`, `/cost-opt`, `/incident-runbook`, `/terraform`

### Growth Stage (growth-kit)
- **marketing-agent** — Marketing strategy, content
- **data-analyst** — BI, metrics, forecasting
- **seo-keyword-strategist** — Keyword research
- **seo-content-writer** — SEO content

**Skills:** `/marketing-plan`, `/content-create`, `/baoyu-xhs-images`, `/baoyu-image-cards`, `/baoyu-comic`, `/baoyu-cover-image`, `/baoyu-article-illustrator`, `/baoyu-infographic`, `/baoyu-youtube-transcript`, `/baoyu-post-to-wechat`, `/baoyu-post-to-weibo`, `/baoyu-post-to-x`

### Docs Stage (docs-kit)
- **docs-agent** — Documents, reports, presentations

**Skills:** `/docx`, `/pdf`, `/pptx`, `/baoyu-translate`, `/baoyu-slide-deck`, `/baoyu-format-markdown`, `/baoyu-markdown-to-html`, `/baoyu-url-to-markdown`, `/baoyu-compress-image`

## Step 4: Execute

### Knowledge Flow (CRITICAL - READ THIS)

**⚠️ The knowledge library is the CORE mechanism for cross-stage context preservation. Without it, multi-stage workflows are incoherent.**

**Each stage must follow knowledge protocol based on workflow config.**

> **详见 `references/knowledge-protocol.md`** — 包含完整的目录结构、Stage-to-Domain 映射、使用示例。

#### The Knowledge Flow Pattern

```
┌─────────────────────────────────────────────────────────────────┐
│                    KNOWLEDGE FLOW PATTERN                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  BEFORE STAGE:                                                   │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ 1. Get knowledge_feature_name from opc_state_read()     │    │
│  │ 2. Parse stage's knowledge config from workflow         │    │
│  │ 3. For each category in read_before:                    │    │
│  │    - Call opc_knowledge_read(feature_name, category)    │    │
│  │ 4. Combine all knowledge into context                   │    │
│  │ 5. Inject knowledge context into agent dispatch         │    │
│  └─────────────────────────────────────────────────────────┘    │
│                              ↓                                   │
│  STAGE EXECUTION: Agent performs work with full context          │
│                              ↓                                   │
│  AFTER STAGE:                                                    │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ 6. Extract knowledge update from agent output           │    │
│  │ 7. Call opc_knowledge_write(feature_name, category, doc,│    │
│  │    content)                                             │    │
│  │ 8. Knowledge is now available for next stage            │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

#### Getting Knowledge Feature (ALWAYS do this first)

```javascript
// Read current state to get knowledge_feature_name
const state = opc_state_read()
const featureName = state.project.knowledge_feature_name

// Use for ALL knowledge operations
opc_knowledge_read({ feature_name: featureName, category: "requirement" })
opc_knowledge_write({ feature_name: featureName, category: "design", doc: "ui", content })
```

#### Stage-to-Category Mapping

| Stage | Category | Doc | What to Read | What to Write |
|-------|----------|-----|--------------|---------------|
| product | requirement | main | - | Requirements, user stories |
| design | design | main | requirement | UI specs, interaction flows |
| dev | architecture | main | requirement, design | System architecture |
| dev | api_guide | main | requirement, design | API contracts, errors |
| dev | tech_guide | main | requirement, design | Tech stack and implementation notes |
| qa | qa_test | main | requirement, architecture, api_guide | Test plans, edge cases |
| growth | growth | main | requirement | Success metrics |

#### Agent Dispatch with Knowledge Context

```
Agent({agent}, `
## Task: {task}

## Knowledge Context (READ THIS FIRST)
${knowledgeContext}

## Instructions
1. ⚠️ Review knowledge context above BEFORE starting work
2. Understand what previous stages have decided
3. Execute your stage tasks building on that context
4. After completion, summarize what should be saved to knowledge library

## Output
1. Your deliverables
2. Knowledge update for this category (will be used by next stages)
`)
```

#### Why This Matters

| Scenario | Without Knowledge Flow | With Knowledge Flow |
|----------|------------------------|---------------------|
| Design stage | Starts from scratch, may contradict requirements | Builds on requirements, consistent UX |
| Dev stage | May implement wrong API contract | Follows design decisions, correct implementation |
| QA stage | May test wrong scenarios | Tests against requirements and edge cases |
| Ship stage | May deploy wrong config | Uses verified architecture decisions |

### State Management (ALWAYS)

**Every task execution must update state:**

```
1. After Step 0: State is already initialized with knowledge_feature_name
2. Before dispatch: Call opc_state_write with stage and agent
3. After completion: Call opc_state_write with artifacts
4. For multi-stage: Call opc_handoff between stages
```

### Simple (Single Agent)
```
This is a [domain] task. Dispatching [agent-name]...
```
1. Read knowledge (if config has read_before)
2. Call `opc_state_write(stage, "in_progress", agent)`
3. Use Agent tool to spawn the agent (with knowledge context)
4. After completion:
   - Write knowledge (if config has write_after)
   - Call `opc_state_write(stage, "completed", artifact)`

### Pipeline (Sequential)
```
This needs a multi-stage pipeline:
1. [agent-1] → [what it does]
2. [agent-2] → [what it does]
3. [agent-3] → [what it does]

Starting stage 1...
```
Execute stages sequentially:
1. Before each stage:
   - Read knowledge (per workflow config)
   - `opc_state_write(stage, "in_progress")`
2. After each stage:
   - Write knowledge (per workflow config)
   - `opc_state_write(stage, "completed")` + `opc_handoff`
3. Pass output to next stage

### Parallel (Independent)
```
This has independent parts. Running in parallel:
- [agent-1]: [task A]
- [agent-2]: [task B]
```
1. Call `opc_task_group_create` with all parallel tasks
2. Call Agent tool multiple times in one message
3. After each completes: `opc_task_update(task_id, status)`
4. After all complete: `opc_state_write(stage, "completed")`

### Project (Complex)
```
This is a complex project. Setting up team coordination:
- Team: [name]
- Tasks: [list]
- Agents: [assignments]
```
1. Call `opc_state_init` to create session
2. Use TeamCreate → TaskCreate → Agent spawns
3. Monitor via TaskList and update state periodically

### Info (Question)
Answer directly. No dispatch needed.

## Step 5: Report

After execution, summarize:
- What was done
- What was produced
- What's next (if anything)
- Any open questions

## Common Patterns

### New Feature (Full Pipeline with TDD+SDD)
```
1. product-kit: /spec-driven-development → define spec
2. dev-kit: /architect → system design
3. dev-kit: /test-driven-development → RED (for each spec item)
4. dev-kit: implement → GREEN → REFACTOR
5. dev-kit: /verification-before-completion → verify
6. qa-kit: /test-plan → /e2e-test
7. ship-kit: /deploy
8. growth-kit: marketing-agent → launch
```

### Dev-Kit Implementation (TDD+SDD Required)
```
When implementing in dev-kit, ALWAYS follow:

1. Get spec from product-kit (or create one)
2. /architect → design
3. For each spec item:
   - /test-driven-development → RED
   - Implement → GREEN
   - Refactor → REFACTOR
4. /verification-before-completion
```

### Bug Fix
```
1. /systematic-debugging → find root cause
2. /test-driven-development → write failing test
3. frontend-agent or backend-agent → fix
4. qa-agent → verify
```

### Security Review
```
security-auditor → audit
  → backend-agent (fix backend)
  → frontend-agent (fix frontend)
  → qa-agent (verify)
```

### Incident Response
```
incident-responder → triage
  → devops-agent → mitigation
  → cloud-architect → infra changes
```

### SEO Sprint
```
seo-keyword-strategist → seo-content-planner → seo-content-writer → marketing-agent
```

## Model Selection Guide

| Model | Agents | Use For |
|-------|--------|---------|
| **opus** | security-auditor, ai-engineer | Critical decisions, complex analysis |
| **sonnet** | Most agents | Standard work, balanced speed/quality |
| **haiku** | seo-keyword-strategist, seo-content-planner | Quick lookups, fast iterations |
| **inherit** | startup-analyst, backend-architect, etc. | Inherits from caller |

## Guidelines

### Core Principles
- Start with understanding, not dispatching
- **Knowledge library is MANDATORY** — it's the foundation for coherent multi-stage workflows
- **Always initialize with `opc_state_init`** — this creates state and auto-matches/sets knowledge_feature_name
- **Get knowledge_feature_name from state** — `opc_state_read().project.knowledge_feature_name` — never guess or assume

### Knowledge Flow (CRITICAL)
1. **Before each stage**: Read knowledge from previous stages
   - `opc_knowledge_read({ feature_name, category })` per workflow config
   - This ensures continuity and context awareness
2. **After each stage**: Write knowledge for future stages
   - `opc_knowledge_write({ feature_name, category, doc, content })` per workflow config
   - This enables knowledge accumulation and handoff

### State Management
- **Update state after each stage** — use `opc_state_write`
- **Record handoffs with context** — use `opc_handoff`

### Execution Best Practices
- Prefer parallel execution when possible
- Use opus agents for security/critical decisions
- Keep humans in the loop for strategic choices
- A one-person company's scarcest resource is time — optimize for it

### Common Mistakes to Avoid
| ❌ Wrong | ✅ Right |
|----------|----------|
| Skip `opc_state_init` and dispatch agent directly | Always call `opc_state_init` first |
| Ignore knowledge library, treat each stage as isolated | Read knowledge before, write after each stage |
| Hardcode `feature_name` in subsequent calls | Get it from `opc_state_read().project.knowledge_feature_name` |
| Start stage without checking previous knowledge | Always check if relevant knowledge exists first |
