# caffeine/opc-marketplace

Caffeine's one-person company Claude Code plugin marketplace — **29 agents, 52 skills, 2 hooks, 20 MCP tools** covering the full product lifecycle.

> [中文文档](./README.zh-CN.md) | **English**

## Quick Start

```shell
/opc <task description>    # One command to orchestrate all agents
/opc-plugin [command]      # Manage plugins
```

| Command | What Happens |
|---------|-------------|
| `/opc build a user management feature` | Full pipeline |
| `/opc research the competitor landscape` | product-agent research |
| `/opc fix this bug` | dev + qa in parallel |
| `/opc security audit` | security-auditor (opus) |
| `/opc ship the new release` | qa → devops → marketing |
| `/opc status` | Show current project progress |
| `/opc resume` | Resume last active session |
| `/opc-plugin install all` | Install all 7 plugins |
| `/opc-plugin install web` | Install for web product |
| `/opc-plugin install designer` | Install for product & design focus |
| `/opc-plugin init` | Initialize project (workflows + .gitignore) |
| `/opc-plugin update` | Update marketplace + all plugins |
| `/opc-plugin uninstall marketplace` | Complete removal |

## Architecture

```
/opc (one-command entry) ──→ founder-agent assesses → auto-orchestrates
  │
  ├── product-kit    Research / Requirements / Brainstorm / Market Analysis
  ├── design-kit     UX Design / UI Design / Design Systems / UI-UX-Pro-Max
  ├── dev-kit        Architecture / Frontend / Backend / Security / Mobile / Database / Performance / MCP
  ├── qa-kit         Test Planning / Bug Reports / E2E Testing / Accessibility Audit / Webapp Testing
  ├── ship-kit       Deploy / CI-CD / IaC / Cloud / Cost / Incident Response
  ├── growth-kit     Marketing / Data Analytics / SEO
  └── docs-kit       Documents / Reports / Presentations / PDFs
```

## Plugins

### opc-founder — Orchestrator
| Type | Name | Description |
|------|------|-------------|
| Skill | `/opc` | One-command entry point — auto-assess and orchestrate agents |
| Skill | `/opc-plugin` | Manage plugins — install, update, uninstall, list, status |
| Skill | `/opc-workflows` | Manage workflow specs — list, show, create, update, delete |
| Agent | founder-agent | CEO agent with 4 orchestration modes (single/pipeline/parallel/team) |
| MCP | opc_state_* | State management tools for cross-session persistence |
| MCP | opc_checkpoint_* | Checkpoint tools for rollback support |
| MCP | opc_handoff | Agent handoff with context preservation |
| MCP | opc_memory | Project memory for decisions and patterns |
| MCP | opc_task_* | Parallel task group management |
| MCP | opc_knowledge_* | Knowledge library management tools |

## State Management

OPC provides cross-session state persistence via MCP tools:

### Directory Structure
```
.opc/
├── workflows/                 # Workflow specs (commit to git)
│   ├── feature-development.json
│   ├── bug-fix.json
│   └── my-custom-workflow.json
├── memory/
│   └── project-memory.json    # Project knowledge (decisions, patterns, lessons)
├── state/
│   ├── sessions/              # Session states (personal, don't commit)
│   └── checkpoints/           # Rollback points (optional)
├── artifacts/                 # Produced files (optional)
└── .project-init              # Marker file (prevents re-copy)
```

### Git Recommendations
| Path | Commit? | Reason |
|------|:-------:|--------|
| `.opc/workflows/` | ✅ | Team-shared workflow specs |
| `.opc/memory/` | ✅ | Team-shared project knowledge |
| `.opc/state/` | ❌ | Personal session data |
| `.opc/state/checkpoints/` | Optional | Rollback points |
| `.opc/artifacts/` | Optional | Depends on project |
| `.opc/.project-init` | ❌ | Local install marker |

### Auto Gitignore
On first `/opc-plugin init`, OPC automatically:
1. Copies built-in workflows to `.opc/workflows/`
2. Adds `.opc/state/` to `.gitignore`
3. Creates `.opc/.project-init` marker to prevent re-run

## Task Queue System

OPC manages tasks with a queue system:

### Rules
- **One task per window**: Each window can only have one task

### Commands
| Command | Description |
|---------|-------------|
| `/opc <task>` | Create new task |
| `/opc status` | Show current task and pipeline progress |

### Task Status Display
```
## Current Task
🔄 build user auth - in_progress

### Pipeline Status
✅ product: completed
🔄 dev: in_progress
⏳ qa: pending
```

### product-kit — Product
| Type | Name | Description |
|------|------|-------------|
| Skill | `/research` | Market and user research |
| Skill | `/requirement` | Product requirements document |
| Skill | `/brainstorm` | Structured brainstorming (SCAMPER / First Principles / Inversion) |
| Skill | `/spec-driven-development` | Define specifications before implementation (SDD + TDD integration) |
| Agent | product-agent | Product manager agent |
| Agent | startup-analyst | TAM/SAM/SOM, financial modeling, competitive analysis |
| Agent | business-analyst | Business process analysis, requirements elicitation, stakeholder management |

### design-kit — Design
| Type | Name | Description |
|------|------|-------------|
| Skill | `/ui-design` | UI/UX design specification |
| Skill | `/ui-ux-pro-max` | Design system generator with 50+ styles, 97 color palettes, 57 font pairings |
| Skill | `/baoyu-imagine` | AI image generation (OpenAI, Azure, Google, OpenRouter, DashScope, Replicate) |
| Agent | brand-agent | Brand strategy, visual identity, logo design, brand guidelines |
| Agent | web-agent | Web design, responsive layouts, dashboards, landing pages |
| Agent | mobile-agent | Mobile design for iOS, Android, React Native, Flutter |
| Agent | design-reviewer | Design review, accessibility compliance, brand compliance |
| Reference | ux-design-guide | UX principles, user flows, wireframing, usability heuristics |
| Reference | ui-design-guide | UI principles, design tokens, color system, typography |
| Reference | design-system-guide | Design system architecture, token taxonomy, component library |
| Reference | ux-research-guide | User research methods, usability testing, interviews |
| Reference | brand-design-guide | Brand design process, visual identity, brand guidelines |
| Reference | design-review-checklist | Design review checklist, accessibility, brand compliance |

### dev-kit — Development
| Type | Name | Description |
|------|------|-------------|
| Skill | `/architect` | Architecture design document |
| Skill | `/code-review` | Code review (Bug / Security / Performance / Readability) |
| Skill | `/openapi-spec` | OpenAPI 3.1 spec generation |
| Skill | `/frontend-design` | Production-grade frontend interfaces with distinctive aesthetics |
| Skill | `/shadcn-ui` | shadcn/ui component integration and customization |
| Skill | `/mcp-builder` | MCP server development guide (Python/TypeScript) |
| Skill | `/systematic-debugging` | Four-phase debugging methodology (Root Cause → Pattern → Hypothesis → Implementation) |
| Skill | `/test-driven-development` | TDD red-green-refactor cycle |
| Skill | `/verification-before-completion` | Completion verification protocol |
| Skill | `/baoyu-diagram` | Professional SVG diagrams (architecture, flowchart, sequence, mind map, timeline) |
| Agent | frontend-agent | Frontend development, component architecture, performance |
| Agent | backend-agent | Backend development, API, data layer, server architecture |
| Agent | backend-architect | API design, microservices, distributed systems |
| Agent | security-auditor | DevSecOps, OWASP, security audit (opus) |
| Agent | mobile-developer | React Native / Flutter / Native development |
| Agent | database-architect | Data modeling, schema design, migration planning |
| Agent | performance-engineer | Performance profiling, optimization, benchmarking |
| Agent | ai-engineer | AI systems engineering, model deployment, MLOps (opus) |
| Agent | prompt-engineer | Prompt engineering, LLM optimization |
| Agent | technical-writer | Technical documentation, API docs, developer guides |
| Hook | auto-lint | Auto-lint on file edit (eslint / py_compile / go vet / cargo check) |

### qa-kit — Quality Assurance
| Type | Name | Description |
|------|------|-------------|
| Skill | `/test-plan` | Test plan generation |
| Skill | `/bug-report` | Structured bug report |
| Skill | `/e2e-test` | Playwright / Cypress E2E testing patterns |
| Skill | `/wcag-audit` | WCAG 2.2 accessibility audit |
| Skill | `/webapp-testing` | Playwright web application testing toolkit |
| Skill | `/a11y-debugging` | Accessibility debugging workflow |
| Skill | `/chrome-devtools` | Chrome DevTools automation for testing |
| Agent | qa-agent | QA testing agent |
| Agent | accessibility-expert | WCAG compliance, assistive technology, a11y testing |

### ship-kit — Ship
| Type | Name | Description |
|------|------|-------------|
| Skill | `/deploy` | Structured deployment with rollback |
| Skill | `/ci-pipeline` | GitHub Actions CI/CD templates |
| Skill | `/changelog` | Automated changelog generation |
| Skill | `/cost-opt` | Cloud cost optimization (AWS / Azure / GCP / OCI) |
| Skill | `/incident-runbook` | Incident response runbook templates |
| Skill | `/terraform` | Terraform IaC module library |
| Skill | `/troubleshooting` | Systematic troubleshooting methodology |
| Agent | devops-agent | Deployment, infrastructure, operations |
| Agent | cloud-architect | Multi-cloud architecture, IaC, FinOps |
| Agent | incident-responder | SRE incident response, troubleshooting, post-mortem |
| Hook | pre-deploy-check | Deploy command safety check |

### growth-kit — Growth
| Type | Name | Description |
|------|------|-------------|
| Skill | `/marketing-plan` | Marketing strategy and channel planning |
| Skill | `/content-create` | Content creation (blog / social / email / case study) |
| Skill | `/baoyu-xhs-images` | Xiaohongshu (Little Red Book) image card series |
| Skill | `/baoyu-image-cards` | Infographic image card series for social media |
| Skill | `/baoyu-comic` | Knowledge comic creator with multiple art styles |
| Skill | `/baoyu-cover-image` | Article cover images with 11 palettes × 7 rendering styles |
| Skill | `/baoyu-article-illustrator` | Article illustration with Type × Style × Palette system |
| Skill | `/baoyu-infographic` | Professional infographics with 21 layouts × 21 styles |
| Skill | `/baoyu-youtube-transcript` | Download YouTube transcripts and cover images |
| Skill | `/baoyu-post-to-wechat` | Post to WeChat Official Account (微信公众号) |
| Skill | `/baoyu-post-to-weibo` | Post to Weibo (微博) |
| Skill | `/baoyu-post-to-x` | Post to X/Twitter |
| Agent | marketing-agent | Marketing agent |
| Agent | data-analyst | BI data analysis, metrics, forecasting |
| Agent | seo-keyword-strategist | Keyword strategy, LSI keywords |
| Agent | seo-content-writer | SEO-optimized content writing |
| Agent | seo-content-planner | Content calendar, topic clusters |

### docs-kit — Documents
| Type | Name | Description |
|------|------|-------------|
| Skill | `/docx` | Word document creation and editing |
| Skill | `/pdf` | PDF processing, merging, splitting, OCR |
| Skill | `/pptx` | PowerPoint presentation generation |
| Skill | `/baoyu-translate` | Three-mode translation (quick/normal/refined) with glossary support |
| Skill | `/baoyu-slide-deck` | Slide deck image generation from content |
| Skill | `/baoyu-format-markdown` | Markdown formatting and beautification |
| Skill | `/baoyu-markdown-to-html` | Markdown to styled HTML (WeChat-compatible) |
| Skill | `/baoyu-url-to-markdown` | Fetch URL and convert to markdown |
| Skill | `/baoyu-compress-image` | Image compression to WebP/PNG |
| Agent | docs-agent | Document generation agent |

## Stats

| Metric | Count |
|--------|-------|
| Plugins | 8 |
| Agents | 29 |
| Skills | 52 |
| Hooks | 2 |
| MCP Tools | 20 |

## Install

```shell
# 1. Add marketplace
/plugin marketplace add CaffeineOddity/opc-marketplace

# 2. Install opc-founder (required)
/plugin install opc-founder@opc-marketplace

# 3. Use /opc-plugin to manage other plugins
/opc-plugin init              # Initialize project (workflows + .gitignore)
/opc-plugin install all       # Install all 7 plugins
/opc-plugin install web       # Web product
/opc-plugin install designer  # Product & design focus
/opc-plugin update            # Update all plugins
/opc-plugin list              # List installed plugins
```

### HUD Statusline

OPC installs a HUD (Heads-Up Display) that shows in the statusline:

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

### Manual Install (Alternative)

```shell
/plugin install product-kit@opc-marketplace
/plugin install design-kit@opc-marketplace
/plugin install dev-kit@opc-marketplace
/plugin install qa-kit@opc-marketplace
/plugin install ship-kit@opc-marketplace
/plugin install growth-kit@opc-marketplace
/plugin install docs-kit@opc-marketplace
```

### Update

```shell
/plugin update              # Update marketplace + all plugins
/plugin update design-kit   # Update specific plugin
```

### Uninstall

#### Option 1: Complete Removal (Recommended)

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

#### Option 2: Step-by-Step

| Command | Removes Plugins | Removes HUD | Removes Marketplace |
|---------|:----------------:|:-----------:|:-------------------:|
| `/opc-plugin uninstall` | ✅ | ✅ | ❌ |
| `/plugin remove opc-marketplace` | ❌ | ❌ | ✅ |
| `/opc-plugin uninstall marketplace` | ✅ | ✅ | ✅ |

## Orchestration Modes

The founder-agent supports 4 orchestration modes. `/opc` selects automatically:

| Mode | Method | Use When |
|------|--------|----------|
| Single | One Agent call | Single stage, single agent |
| Pipeline | Sequential Agent calls | Multi-stage with dependencies |
| Parallel | Multiple Agent calls at once | Independent tasks |
| Team | TeamCreate + TaskCreate + SendMessage | Complex projects, 3+ agents |

## Agent Collaboration Flows

```
New Feature (Full Pipeline):
  product-agent → brand-agent → web-agent → design-reviewer → frontend-agent + backend-agent → qa-agent → devops-agent → marketing-agent

Security Review:
  security-auditor → backend-agent → qa-agent

Incident Response:
  incident-responder → devops-agent → cloud-architect

Growth Sprint:
  seo-keyword-strategist → seo-content-planner → seo-content-writer → marketing-agent → data-analyst

Mobile App:
  brand-agent → mobile-agent → design-reviewer → mobile-developer → backend-agent → qa-agent
```

## Contributing

Contributions are welcome! This marketplace is designed to grow with the community.

### Ways to Contribute

- **New agents or skills** — Add to an existing plugin or propose a new one
- **Improve existing agents** — Better prompts, more tools, tighter handoffs
- **New plugins** — Cover stages we haven't thought of (e.g., legal, fundraising, hiring)
- **Bug fixes** — Fix broken agents or outdated prompts
- **Translations** — Help keep docs bilingual (EN + ZH-CN)

### How to Contribute

1. Fork this repository
2. Create your feature branch (`git checkout -b feature/my-new-agent`)
3. Add or modify plugins under `plugins/`
4. Update the plugin's `plugin.json` version
5. Update `marketplace.json` if adding a new plugin
6. Submit a pull request

### Plugin Structure

```
plugins/your-plugin/
├── .claude-plugin/
│   └── plugin.json          # Plugin manifest (required)
├── agents/                   # Agent definitions
│   └── your-agent.md
├── skills/                   # Skill definitions
│   └── your-skill/
│       └── SKILL.md
└── hooks/                    # Hook definitions
    └── hooks.json
```

### Guidelines

- One plugin per product lifecycle stage
- Agents should be focused — one clear responsibility per agent
- Skills should be self-contained and composable
- Follow kebab-case for all names
- Bump version in `plugin.json` when making changes

## License

MIT
