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
| `opc_state_init` | Initialize a new project with pipeline tracking and auto knowledge feature matching |
| `opc_state_read` | Read current project state and progress |
| `opc_state_write` | Update stage status, progress, artifacts, knowledge_feature_name |
| `opc_state_clear` | Clear current task state |
| `opc_sessions_list` | List all OPC task sessions |
| `opc_handoff` | Record agent handoff with context |
| `opc_task_group_create` | Create a parallel/serial task group |
| `opc_task_update` | Update task status and progress |
| `opc_task_group_status` | Get status of task groups |
| `opc_workflows_path` | Get the workflows directory path |

### MCP Tools (Knowledge Library)

| Tool | Description |
|------|-------------|
| `opc_knowledge_init` | Initialize knowledge library for a feature (requires feature_name) |
| `opc_knowledge_read` | Read knowledge from a category/doc |
| `opc_knowledge_write` | Write or update knowledge document |
| `opc_knowledge_exists` | Check if knowledge document exists |
| `opc_knowledge_list` | List topics in knowledge library |
| `opc_knowledge_list_brief` | List all documents with brief metadata (progressive loading) |
| `opc_knowledge_docs` | List available documents in a category |
| `opc_knowledge_rebuild_index` | Rebuild index.json from filesystem (use when corrupted or out of sync) |

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
- **Knowledge library** — Self-evolving knowledge accumulation across stages

### State Files

```
.opc/
├── state/
│   └── sessions/{session-id}/project-state.json
├── knowledge/
│   └── {feature_name}/{category}/xxx.md
└── workflows/
```

### Usage

The founder-agent automatically manages state for multi-stage projects. You can also use commands:

```shell
/opc status              # Show current project progress
/opc resume              # Resume last active session
```

## Plugin Management

```shell
/opc-plugin init              # Initialize project: .gitignore + workflows + marker
/opc-plugin init --force      # Force re-run initialization
/opc-plugin install           # Interactive install
/opc-plugin install all       # Install all 7 plugins
/opc-plugin install web       # Web product (product + design + dev + qa + ship + growth)
/opc-plugin install mobile    # Mobile app (product + design + dev + qa + ship)
/opc-plugin install designer  # Product & Design focus (product + design + docs)
/opc-plugin update            # Update marketplace + all plugins
/opc-plugin uninstall         # Uninstall all OPC plugins
/opc-plugin uninstall marketplace  # Complete removal: plugins + HUD + marketplace
/opc-plugin list              # List installed plugins
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
└── .project-init                 # Marker (prevents re-copy)
```

**Note:** Workflows are copied on first `/opc-plugin init` and should be committed to git for team sharing.

## Knowledge Library

OPC provides a self-evolving knowledge library that accumulates project knowledge across the full lifecycle.

### Directory Structure

```
.opc/knowledge/
├── ios-localization/           # Feature: iOS多语言功能
│   ├── requirement/
│   │   └── main.md
│   ├── architecture/
│   │   └── main.md
│   ├── api_guide/
│   │   └── main.md
│   └── qa_test/
│       └── main.md
├── user-auth/                  # Feature: 用户认证
│   ├── requirement/
│   │   └── main.md
│   ├── core_flows/
│   │   └── main.md
│   └── issues/
│       └── index.md
└── index.json                  # Global index
```

### Feature-Based Organization

Knowledge library uses **semantic features** instead of requirement IDs:

| Feature | Description |
|---------|-------------|
| `ios-localization` | iOS多语言功能 |
| `user-auth` | 用户认证功能 |
| `payment-integration` | 支付集成 |

**Benefits:**
- Self-describing features that match task semantics
- Automatic similarity matching for knowledge reuse
- No manual ID management

### Usage Flow

```
1. Task Start → opc_state_init auto-matches/sets knowledge_feature_name
2. Before Stage → Read existing knowledge
3. After Stage → Write/update knowledge
```

### MCP Tool Usage

```typescript
// Initialize knowledge library for a feature
opc_knowledge_init({ title: "iOS多语言功能", feature_name: "ios-localization" })

// Read requirement before design phase
opc_knowledge_read({ feature_name: "ios-localization", category: "requirement" })

// Write design after design phase (with name and description)
opc_knowledge_write({
  feature_name: "ios-localization",
  category: "design",
  doc: "ui",
  content: "## Login Page Layout\n...",
  name: "UI设计文档",
  description: "登录页面和主界面的UI设计规范",
})

// Read ios tech before development
opc_knowledge_read({ feature_name: "ios-localization", category: "tech_guide", doc: "main" })

// Write tech guide after development
opc_knowledge_write({
  feature_name: "ios-localization",
  category: "tech_guide",
  doc: "main",
  content: "## 2025-05-03\n- LanguageManager component",
  name: "技术指南",
  description: "iOS多语言技术实现方案",
})

// Check if knowledge exists
opc_knowledge_exists({ feature_name: "ios-localization", category: "tech_guide", doc: "main" })

// List all features
opc_knowledge_list()

// List docs in a category
opc_knowledge_docs({ feature_name: "ios-localization", category: "tech_guide" })

// List all documents with brief metadata (progressive loading)
opc_knowledge_list_brief()

// Rebuild index from filesystem (use when corrupted or out of sync)
opc_knowledge_rebuild_index()
```

### Index Recovery

If `index.json` becomes corrupted or out of sync with the actual files:

```typescript
// Rebuild index from filesystem
opc_knowledge_rebuild_index()

// Returns:
// - Statistics: features found, categories found, documents found
// - Changes: features added/removed
// - Current index state
```

**Use cases:**
- `index.json` is missing or corrupted
- Manual file operations (create/delete) were performed
- Migrating from older versions
- Syncing index with actual filesystem state

### Self-Evolution

The knowledge library evolves automatically:

1. **New Task** → opc_state_init auto-matches or creates knowledge_feature_name
2. **Stage Start** → Read category knowledge (if exists)
3. **Stage Complete** → Write/update category knowledge
4. **Future Tasks** → Auto-match similar topics and reuse knowledge

**Note:** Knowledge files should be committed to git for team sharing.

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
