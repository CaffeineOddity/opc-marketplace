# caffeine/opc-marketplace

Caffeine's one-person company Claude Code plugin marketplace — **20 agents, 14 skills, 2 hooks** covering the full product lifecycle.

> [中文文档](./README.zh-CN.md) | **English**

## Quick Start

```shell
/opc <task description>    # One command to orchestrate all agents
```

| Command | What Happens |
|---------|-------------|
| `/opc build a user management feature` | Full pipeline |
| `/opc research the competitor landscape` | product-agent research |
| `/opc fix this bug` | dev + qa in parallel |
| `/opc security audit` | security-auditor (opus) |
| `/opc ship the new release` | qa → devops → marketing |

## Architecture

```
/opc (one-command entry) ──→ founder-agent assesses → auto-orchestrates
  │
  ├── product-kit    Research / Requirements / Brainstorm / Market Analysis
  ├── design-kit     UX Design / UI Design / Design Systems
  ├── dev-kit        Architecture / Frontend / Backend / Security / Mobile / Database
  ├── qa-kit         Test Planning / Bug Reports / E2E Testing / Accessibility Audit
  ├── ship-kit       Deploy / CI-CD / IaC / Cloud / Cost / Incident Response
  └── growth-kit     Marketing / Data Analytics / SEO
```

## Plugins

### opc-founder — Orchestrator
| Type | Name | Description |
|------|------|-------------|
| Skill | `/opc` | One-command entry point — auto-assess and orchestrate agents |
| Agent | founder-agent | CEO agent with 4 orchestration modes (single/pipeline/parallel/team) |

### product-kit — Product
| Type | Name | Description |
|------|------|-------------|
| Skill | `/research` | Market and user research |
| Skill | `/requirement` | Product requirements document |
| Skill | `/brainstorm` | Structured brainstorming (SCAMPER / First Principles / Inversion) |
| Agent | product-agent | Product manager agent |
| Agent | startup-analyst | TAM/SAM/SOM, financial modeling, competitive analysis |

### design-kit — Design
| Type | Name | Description |
|------|------|-------------|
| Skill | `/ui-design` | UI/UX design specification |
| Agent | ux-agent | Information architecture, user flows, wireframes, interaction logic |
| Agent | ui-agent | Visual design, design systems, component specs, design tokens |
| Agent | ui-ux-designer | Full-stack UI/UX designer reference |

### dev-kit — Development
| Type | Name | Description |
|------|------|-------------|
| Skill | `/architect` | Architecture design document |
| Skill | `/code-review` | Code review (Bug / Security / Performance / Readability) |
| Skill | `/openapi-spec` | OpenAPI 3.1 spec generation |
| Agent | frontend-agent | Frontend development, component architecture, performance |
| Agent | backend-agent | Backend development, API, data layer, server architecture |
| Agent | security-auditor | DevSecOps, OWASP, security audit (opus) |
| Agent | mobile-developer | React Native / Flutter / Native development |
| Agent | database-architect | Data modeling, schema design, migration planning |
| Hook | auto-lint | Auto-lint on file edit (eslint / py_compile / go vet / cargo check) |

### qa-kit — Quality Assurance
| Type | Name | Description |
|------|------|-------------|
| Skill | `/test-plan` | Test plan generation |
| Skill | `/bug-report` | Structured bug report |
| Skill | `/e2e-test` | Playwright / Cypress E2E testing patterns |
| Skill | `/wcag-audit` | WCAG 2.2 accessibility audit |
| Agent | qa-agent | QA testing agent |

### ship-kit — Ship
| Type | Name | Description |
|------|------|-------------|
| Skill | `/deploy` | Structured deployment with rollback |
| Skill | `/ci-pipeline` | GitHub Actions CI/CD templates |
| Skill | `/changelog` | Automated changelog generation |
| Skill | `/cost-opt` | Cloud cost optimization (AWS / Azure / GCP / OCI) |
| Skill | `/incident-runbook` | Incident response runbook templates |
| Skill | `/terraform` | Terraform IaC module library |
| Agent | devops-agent | Deployment, infrastructure, operations |
| Agent | cloud-architect | Multi-cloud architecture, IaC, FinOps |
| Agent | incident-responder | SRE incident response, troubleshooting, post-mortem |
| Hook | pre-deploy-check | Deploy command safety check |

### growth-kit — Growth
| Type | Name | Description |
|------|------|-------------|
| Skill | `/marketing-plan` | Marketing strategy and channel planning |
| Skill | `/content-create` | Content creation (blog / social / email / case study) |
| Agent | marketing-agent | Marketing agent |
| Agent | data-analyst | BI data analysis, metrics, forecasting |
| Agent | seo-keyword-strategist | Keyword strategy, LSI keywords |
| Agent | seo-content-writer | SEO-optimized content writing |
| Agent | seo-content-planner | Content calendar, topic clusters |

## Stats

| Metric | Count |
|--------|-------|
| Plugins | 7 |
| Agents | 20 |
| Skills | 14 |
| Hooks | 2 |

## Install

```shell
# Add marketplace
/plugin marketplace add CaffeineOddity/opc-marketplace

# Install all plugins
/plugin install opc-founder@opc-marketplace
/plugin install product-kit@opc-marketplace
/plugin install design-kit@opc-marketplace
/plugin install dev-kit@opc-marketplace
/plugin install qa-kit@opc-marketplace
/plugin install ship-kit@opc-marketplace
/plugin install growth-kit@opc-marketplace

# Update
/plugin marketplace update opc-marketplace
```

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
  product-agent → ux-agent → ui-agent → frontend-agent + backend-agent → qa-agent → devops-agent → marketing-agent

Security Review:
  security-auditor → backend-agent → qa-agent

Incident Response:
  incident-responder → devops-agent → cloud-architect

Growth Sprint:
  seo-keyword-strategist → seo-content-planner → seo-content-writer → marketing-agent → data-analyst

Mobile App:
  ux-agent → ui-agent → mobile-developer → backend-agent → qa-agent
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
