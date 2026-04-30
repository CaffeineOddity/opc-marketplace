# caffeine/opc-marketplace

Caffeine's one-person company Claude Code plugin marketplace — full product lifecycle from research to growth.

## Architecture

```
opc-founder (统帅) ──→ 调度全流程 agent teams
  │
  ├── product-kit    需求调研 / 需求撰写 / 头脑风暴
  ├── design-kit     UI/UX 设计
  ├── dev-kit        架构设计 / 前后端开发 / 自动 lint
  ├── qa-kit         测试计划 / 缺陷报告
  ├── ship-kit       部署上线 / 运维
  └── growth-kit     市场推广 / 内容创作
```

## Plugins

| Plugin | Category | Skills | Agents | Hooks |
|--------|----------|--------|--------|-------|
| `opc-founder` | Orchestration | — | founder-agent | — |
| `product-kit` | Product | `/research`, `/requirement`, `/brainstorm` | product-agent | — |
| `design-kit` | Design | `/ui-design` | design-agent | — |
| `dev-kit` | Development | `/architect`, `/code-review` | frontend-agent, backend-agent | auto-lint |
| `qa-kit` | Testing | `/test-plan`, `/bug-report` | qa-agent | — |
| `ship-kit` | DevOps | `/deploy` | devops-agent | pre-deploy-check |
| `growth-kit` | Marketing | `/marketing-plan`, `/content-create` | marketing-agent | — |

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

## Plugin Details

### opc-founder
The CEO agent. Orchestrates cross-stage agent teams — dispatches product, design, dev, QA, devops, and marketing agents based on the task. Supports sequential and parallel workflows for the full product lifecycle.

### product-kit
- `/research` — Market and user research with structured findings
- `/requirement` — Write testable product requirements from ideas
- `/brainstorm` — Structured ideation with SCAMPER, first principles, and inversion techniques

### design-kit
- `/ui-design` — Generate UI/UX specifications from requirements (IA, interaction design, components, design tokens)

### dev-kit
- `/architect` — Architecture design documents (system, API, data model, infrastructure)
- `/code-review` — Code review across bug/security/performance/readability dimensions
- **frontend-agent** — UI implementation, component architecture, performance optimization
- **backend-agent** — API development, data layer, server architecture
- **auto-lint** — Automatically runs eslint/py_compile/go vet/cargo check on file edits

### qa-kit
- `/test-plan` — Generate test plans from requirements (functional, integration, non-functional)
- `/bug-report` — Structured bug reports with severity, reproduction steps, and root cause

### ship-kit
- `/deploy` — Structured deployment with pre-flight checks, rollback plans, and post-deploy verification
- **devops-agent** — Deployment, infrastructure, and operational tasks
- **pre-deploy-check** — Hook that warns before deploy/publish/release commands

### growth-kit
- `/marketing-plan` — Marketing strategy with channel tactics, budget, and KPIs
- `/content-create` — Create blog posts, social media, newsletters, launch copy, case studies

## Agent Collaboration Flow

```
New Feature (Full Pipeline):
  product-agent → design-agent → frontend-agent + backend-agent → qa-agent → devops-agent → marketing-agent

Quick Fix:
  qa-agent → dev-agent → devops-agent

Growth Sprint:
  marketing-agent → product-agent (validate messaging)
```
