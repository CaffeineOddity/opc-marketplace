# opc-founder

One-person company orchestrator plugin — the CEO agent that coordinates all other agents across the full product lifecycle.

## Components

### Skills

| Skill | Description |
|-------|-------------|
| `/opc` | One-command entry point — auto-assess task and orchestrate agents |
| `/opc-plugin` | Manage plugins — install, update, uninstall, list, status |
| `/opc-hud` | Configure HUD statusline display — setup, uninstall, status |

### Agents

| Agent | Model | Description |
|-------|-------|-------------|
| founder-agent | opus | CEO agent with 4 orchestration modes (single/pipeline/parallel/team) |

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
