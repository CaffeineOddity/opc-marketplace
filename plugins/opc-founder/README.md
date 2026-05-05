# opc-founder

One-person company orchestrator plugin — the CEO agent that coordinates all other agents across the full product lifecycle.

## Components

### Skills

| Skill | Description |
|-------|-------------|
| `/opc` | One-command entry point — auto-assess task and orchestrate agents |
| `/opc-plugin` | Manage plugins — install, update, uninstall, list, status |
| `/opc-workflows` | Manage workflow specs — list, show, create, update, delete |

### Agents

| Agent | Model | Description |
|-------|-------|-------------|
| founder-agent | opus | CEO agent with 4 orchestration modes (single/pipeline/parallel/team) |

### MCP Tools (State Management)

| Tool | Description |
|------|-------------|
| `opc_state_init` | Initialize a new project with pipeline tracking |
| `opc_state_read` | Read current project state and progress |
| `opc_state_write` | Update stage status, progress, artifacts |
| `opc_checkpoint_create` | Create a checkpoint before risky operations |
| `opc_checkpoint_list` | List available checkpoints |
| `opc_checkpoint_rollback` | Restore state from a checkpoint |
| `opc_handoff` | Record agent handoff with context |
| `opc_memory` | Read/write project decisions and patterns |
| `opc_task_group_create` | Create a parallel/serial task group |
| `opc_task_update` | Update task status and progress |
| `opc_task_group_status` | Get status of task groups |

### MCP Tools (Knowledge Library)

| Tool | Description |
|------|-------------|
| `opc_knowledge_init` | Initialize knowledge library for a requirement |
| `opc_knowledge_read` | Read knowledge from a domain/platform/doc |
| `opc_knowledge_write` | Write or update knowledge document |
| `opc_knowledge_exists` | Check if knowledge document exists |
| `opc_knowledge_list` | List requirements in knowledge library |
| `opc_knowledge_docs` | List available documents in a domain |

## Quick Start

```shell
/opc <task description>
```

### Examples

| Command | What Happens |
|---------|-------------|
| `/opc build a user management feature` | Full pipeline: product → design → dev → qa → ship |
| `/opc research the competitor landscape` | Dispatches product-agent for research |
| `/opc fix this bug` | Parallel: dev + qa agents |
| `/opc security audit` | Dispatches security-auditor (opus) |
| `/opc ship the new release` | Sequential: qa → devops → marketing |
| `/opc status` | Show current project progress |
| `/opc resume` | Resume last active session |

## State Management

OPC provides persistent state management for multi-stage projects:

### Features

- **Cross-session memory** — Pause and resume projects
- **Stage tracking** — Track progress through product → design → dev → qa → ship → growth
- **Parallel task groups** — Track concurrent agents with progress per task
- **Agent handoffs** — Preserve context when passing work between agents
- **Checkpoints** — Create restore points before risky operations
- **Project memory** — Store decisions, patterns, and lessons learned

### State Files

```
.opc/
├── state/
│   ├── sessions/{session-id}/project-state.json
│   └── checkpoints/{checkpoint-id}.json
├── memory/project-memory.json
└── logs/
```

### Usage

The founder-agent automatically manages state for multi-stage projects. You can also use commands:

```shell
/opc status              # Show current project progress
/opc resume              # Resume last active session
```

## Plugin Management

```shell
/opc-plugin install          # Interactive install
/opc-plugin install all      # Install all 7 plugins
/opc-plugin install web      # Web product (product + design + dev + qa + ship + growth)
/opc-plugin install mobile   # Mobile app (product + design + dev + qa + ship)
/opc-plugin install designer # Product & Design focus (product + design + docs)
/opc-plugin update           # Update marketplace + all plugins
/opc-plugin uninstall        # Uninstall all OPC plugins
/opc-plugin uninstall marketplace  # Complete removal: plugins + HUD + marketplace
/opc-plugin list             # List installed plugins
```

## Workflow Specs

OPC uses workflow specs to define pipeline stages and constraints for different scenarios:

```shell
/opc-workflows list              # List all workflow specs
/opc-workflows show <name>       # Show a specific workflow
/opc-workflows create <name>     # Create a new workflow (interactive)
/opc-workflows update <name>     # Update an existing workflow
/opc-workflows delete <name>     # Delete a workflow
```

### Built-in Workflows

| Workflow | Triggers | Pipeline |
|----------|----------|----------|
| `feature-development` | 实现、开发、添加、功能 | Product → Design → Dev → QA → Ship (SDD + TDD) |
| `bug-fix` | 修复、bug、错误、崩溃 | Diagnosis → Dev → QA (TDD) |
| `security-fix` | 安全、漏洞、CVE | Diagnosis → Dev → Security Audit → QA |
| `api-development` | API、接口、REST | Product → Dev → QA (API-First + TDD) |
| `refactor` | 重构、优化、清理 | Dev → QA (preserve tests) |
| `documentation` | 文档、说明、readme | Docs |
| `product-design` | 产品设计 | Product → Design → Review |

### Workflow Files

Workflows are stored in `.opc/workflows/`:

```
.opc/
├── workflows/
│   ├── feature-development.json
│   ├── bug-fix.json
│   ├── security-fix.json
│   └── my-custom-workflow.json   # User-created workflows
└── .first-install-done           # Marker (prevents re-copy)
```

**Note:** Workflows are copied on first `/opc-plugin install` and should be committed to git for team sharing.

## Knowledge Library

OPC provides a self-evolving knowledge library that accumulates project knowledge across the full lifecycle.

### Directory Structure

```
.opc/knowledgebase/
├── REQ-001/
│   ├── requirement/
│   │   └── main.md              # Requirement knowledge
│   ├── design/
│   │   ├── ui.md                # UI design
│   │   └── interaction.md       # Interaction design
│   ├── platforms/
│   │   ├── web/
│   │   │   ├── tech.md          # Web frontend tech
│   │   │   └── test.md          # Web tests
│   │   ├── ios/
│   │   │   ├── tech.md          # iOS tech
│   │   │   └── test.md          # iOS tests
│   │   ├── android/
│   │   │   ├── tech.md          # Android tech
│   │   │   └── test.md          # Android tests
│   │   └── miniprogram/
│   │       ├── tech.md          # Miniprogram tech
│   │       └── test.md          # Miniprogram tests
│   ├── backend/
│   │   ├── api.md               # API documentation
│   │   ├── architecture.md      # Backend architecture
│   │   └── test.md              # Backend tests
│   ├── shared/
│   │   ├── database.md          # Database schema
│   │   └── infrastructure.md    # Infrastructure
│   └── growth/
│       ├── metrics.md           # Growth metrics
│       └── analytics.md         # Analytics
├── REQ-002/
│   └── ...
└── index.json                    # Global index
```

### Usage Flow

```
1. Task Start → Read existing knowledge
2. Task Execute → Based on knowledge
3. Task Complete → Update knowledge
```

### MCP Tool Usage

```typescript
// Initialize knowledge library for a requirement
opc_knowledge_init("REQ-001", "User Login Feature")

// Read requirement before design phase
opc_knowledge_read("REQ-001", "requirement")

// Write design after design phase
opc_knowledge_write("REQ-001", "design", "ui", "## Login Page Layout\n...")

// Read web tech before frontend development
opc_knowledge_read("REQ-001", "platforms", "web", "tech")

// Write web tech after development
opc_knowledge_write("REQ-001", "platforms", "web", "tech", "## 2025-05-03\n- LoginForm component\n- useAuth hook")

// Check if knowledge exists
opc_knowledge_exists("REQ-001", "platforms", "web", "tech")

// List all requirements
opc_knowledge_list()

// List docs in a domain
opc_knowledge_docs("REQ-001", "platforms")
```

### Self-Evolution

The knowledge library evolves automatically:

1. **New Requirement** → Initialize knowledge library
2. **Stage Start** → Read domain knowledge (if exists)
3. **Stage Complete** → Write/update domain knowledge
4. **Future Tasks** → Read and build upon existing knowledge

**Note:** Knowledge files should be committed to git for team sharing.

## HUD Statusline

OPC automatically installs a HUD (Heads-Up Display) for the statusline on first plugin install:

```
[OPC#1.0] | Opus | session:5m | skill:opc-plugin | ctx:45% | 🔧3 ⚡1 🎯2
```

| Element | Description |
|---------|-------------|
| `[OPC#version]` | OPC marketplace identifier |
| `Opus/Sonnet/Haiku` | Current model name |
| `session:Xm` | Session duration |
| `skill:name` | Last activated skill |
| `ctx:X%` | Context window usage (green/yellow/red) |
| `🔧N ⚡N 🎯N` | Tool/Agent/Skill call counts |

The HUD is installed automatically when you run `/opc-plugin install`.

## Uninstall

### Option 1: Complete Removal (Recommended)

One command removes everything:

```shell
/opc-plugin uninstall marketplace
```

This removes:
- All OPC plugins from cache
- HUD statusline
- Marketplace registration from settings.json
- Marketplace directory

After running, execute `/reload-plugins` to refresh.

### Option 2: Step-by-Step

| Command | Removes Plugins | Removes HUD | Removes Marketplace |
|---------|:----------------:|:-----------:|:-------------------:|
| `/opc-plugin uninstall` | ✅ | ✅ | ❌ |
| `/plugin remove opc-marketplace` | ❌ | ❌ | ✅ |
| `/opc-plugin uninstall marketplace` | ✅ | ✅ | ✅ |

**Note:** If you accidentally ran `/plugin remove` first, manually clean up:
- Remove `~/.claude/plugins/cache/opc-marketplace/`
- Remove `statusLine` from `~/.claude/settings.json`
- Remove OPC entries from `~/.claude/plugins/installed_plugins.json`

## Orchestration Modes

The founder-agent automatically selects the appropriate mode:

| Mode | Method | Use When |
|------|--------|----------|
| **Single** | One Agent call | Single stage, single agent |
| **Pipeline** | Sequential Agent calls | Multi-stage with dependencies |
| **Parallel** | Multiple Agent calls at once | Independent tasks |
| **Team** | TeamCreate + TaskCreate + SendMessage | Complex projects, 3+ agents |

### Mode Selection Logic

```
Task received
    │
    ├── Single stage, one agent? ──→ Mode 1: Single
    │
    ├── Multi-stage, A needs B's output? ──→ Mode 2: Pipeline
    │
    ├── 2-3 independent tasks? ──→ Mode 3: Parallel
    │
    └── Complex project, 3+ agents, ongoing coordination? ──→ Mode 4: Team
```

## Agent Network (29 Agents)

The founder-agent orchestrates 29 specialized agents across 8 plugins:

| Plugin | Agents | Stage |
|--------|--------|-------|
| **product-kit** | product-agent, startup-analyst, business-analyst | Product |
| **design-kit** | brand-agent, web-agent, mobile-agent, design-reviewer | Design |
| **dev-kit** | frontend-agent, backend-agent, backend-architect, security-auditor, mobile-developer, database-architect, performance-engineer, ai-engineer, prompt-engineer, technical-writer | Development |
| **qa-kit** | qa-agent, accessibility-expert | Quality |
| **ship-kit** | devops-agent, cloud-architect, incident-responder | Ship |
| **growth-kit** | marketing-agent, data-analyst, seo-keyword-strategist, seo-content-writer, seo-content-planner | Growth |
| **docs-kit** | docs-agent | Documents |

## Workflow Patterns

### New Feature (Full Pipeline)

```
Stage 1: product-agent → research + requirements
Stage 2: brand-agent → web-agent → design-reviewer → design specs
Stage 3: frontend-agent + backend-agent (parallel) → implementation
Stage 4: qa-agent → security-auditor → validation
Stage 5: devops-agent → deployment
Stage 6: marketing-agent → launch
```

### Security Review

```
security-auditor (opus) → audit findings
    → backend-agent → fix backend issues
    → frontend-agent → fix frontend issues
    → qa-agent → verify fixes
```

### Incident Response

```
incident-responder → triage + diagnosis
    → devops-agent → mitigation
    → cloud-architect → infrastructure changes
```

### Growth Sprint

```
seo-keyword-strategist → seo-content-planner → seo-content-writer → marketing-agent
```

## Subagent-Driven Development

For complex implementation tasks:

```
1. Implementer Agent (fresh context)
   └── Builds from spec, no prior context baggage

2. Spec Reviewer
   └── Validates against requirements

3. Quality Reviewer
   └── Checks code quality, security, performance
```

## Agent-Teams Cooperation

When using TeamCreate for multi-agent projects:

### Message Types
- `message` — Direct communication to specific teammate
- `broadcast` — Announcement to all team members
- `shutdown_request` — Graceful team termination

### Task Coordination
```
1. TaskCreate → define work with dependencies
2. TaskUpdate(owner) → assign to agent
3. Agent spawns with team_name → joins coordination
4. TaskUpdate(status: completed) → unblocks dependents
5. TaskList → find next available work
```
