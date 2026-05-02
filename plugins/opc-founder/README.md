# opc-founder

One-person company orchestrator plugin — the CEO agent that coordinates all other agents across the full product lifecycle.

## Components

### Skills

| Skill | Description |
|-------|-------------|
| `/opc` | One-command entry point — auto-assess task and orchestrate agents |
| `/opc-plugin` | Manage plugins — install, update, uninstall, list, status |
| `/opc-workflows` | Manage workflow specs — list, show, create, update, delete |
| `/opc-hud` | Configure HUD statusline display — setup, uninstall, status |

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

## HUD Statusline

OPC provides a HUD (Heads-Up Display) for the statusline:

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

```shell
/opc-hud setup      # Install HUD
/opc-hud uninstall  # Remove HUD
/opc-hud status     # Show HUD status
```

## Uninstall

| Command | Removes Plugins | Removes HUD |
|---------|:----------------:|:-----------:|
| `/opc-plugin uninstall` | ✅ | ❌ |
| `/opc-hud uninstall` | ❌ | ✅ |
| `/plugin remove opc-marketplace` | ✅ | ✅ |

**Note:** HUD is stored in `~/.claude/plugins/cache/opc-marketplace/hud/`, so `/plugin remove opc-marketplace` automatically cleans up both plugins and HUD.

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
