# caffeine/opc-marketplace

Caffeine's one-person company Claude Code plugin marketplace — **18 agents, 13 skills, 2 hooks** covering the full product lifecycle.

## Architecture

```
opc-founder (统帅) ──→ 调度全流程 agent teams
  │
  ├── product-kit    需求调研 / 需求撰写 / 头脑风暴
  ├── design-kit     UX设计 / UI设计 / 设计系统
  ├── dev-kit        架构 / 前端 / 后端 / 安全 / 移动 / 数据库
  ├── qa-kit         测试计划 / 缺陷报告 / E2E测试 / 无障碍审计
  ├── ship-kit       部署 / CI/CD / IaC / 云架构 / 成本 / 事故响应
  └── growth-kit     营销 / 数据分析 / SEO
```

## Plugins

### opc-founder — 统帅
| Type | Name | Description |
|------|------|-------------|
| Agent | founder-agent | CEO agent，调度全流程 agent teams |
| Agent | startup-analyst | 创业分析师，TAM/SAM/SOM、财务模型、竞争分析 |

### product-kit — 产品
| Type | Name | Description |
|------|------|-------------|
| Skill | `/research` | 市场和用户调研 |
| Skill | `/requirement` | 产品需求文档撰写 |
| Skill | `/brainstorm` | 结构化头脑风暴 (SCAMPER/第一性原理/逆向) |
| Agent | product-agent | 产品经理智能体 |

### design-kit — 设计
| Type | Name | Description |
|------|------|-------------|
| Skill | `/ui-design` | UI/UX设计规范生成 |
| Agent | ux-agent | UX专家：信息架构、用户流程、线框图、交互逻辑 |
| Agent | ui-agent | UI专家：视觉设计、设计系统、组件规范、设计令牌 |
| Agent | ui-ux-designer | 全栈UI/UX设计师参考 |

### dev-kit — 开发
| Type | Name | Description |
|------|------|-------------|
| Skill | `/architect` | 架构设计文档 |
| Skill | `/code-review` | 代码审查 (Bug/安全/性能/可读性) |
| Skill | `/openapi-spec` | OpenAPI 3.1 规范生成 |
| Agent | frontend-agent | 前端开发、组件架构、性能优化 |
| Agent | backend-agent | 后端开发、API、数据层、服务架构 |
| Agent | security-auditor | DevSecOps、OWASP、安全审计 (opus) |
| Agent | mobile-developer | React Native/Flutter/原生开发 |
| Agent | database-architect | 数据建模、Schema设计、迁移规划 |
| Hook | auto-lint | 文件编辑后自动 lint |

### qa-kit — 测试
| Type | Name | Description |
|------|------|-------------|
| Skill | `/test-plan` | 测试计划生成 |
| Skill | `/bug-report` | 结构化缺陷报告 |
| Skill | `/e2e-test` | Playwright/Cypress E2E测试模式 |
| Skill | `/wcag-audit` | WCAG 2.2 无障碍审计 |
| Agent | qa-agent | QA测试智能体 |

### ship-kit — 上线
| Type | Name | Description |
|------|------|-------------|
| Skill | `/deploy` | 结构化部署与回滚 |
| Skill | `/ci-pipeline` | GitHub Actions CI/CD模板 |
| Skill | `/changelog` | 自动变更日志 |
| Skill | `/cost-opt` | 云成本优化 (AWS/Azure/GCP/OCI) |
| Skill | `/incident-runbook` | 事故响应手册模板 |
| Skill | `/terraform` | Terraform IaC模块库 |
| Agent | devops-agent | 部署、基础设施、运维 |
| Agent | cloud-architect | 多云架构、IaC、FinOps |
| Agent | incident-responder | SRE事故响应、故障排查 |
| Hook | pre-deploy-check | 部署命令安全检查 |

### growth-kit — 增长
| Type | Name | Description |
|------|------|-------------|
| Skill | `/marketing-plan` | 营销策略与渠道规划 |
| Skill | `/content-create` | 内容创作 (博客/社媒/邮件/案例) |
| Agent | marketing-agent | 营销智能体 |
| Agent | data-analyst | BI数据分析、指标体系、预测分析 |
| Agent | seo-keyword-strategist | 关键词策略、LSI关键词 |
| Agent | seo-content-writer | SEO优化内容写作 |
| Agent | seo-content-planner | 内容日历、话题集群 |

## Stats

| Metric | Count |
|--------|-------|
| Plugins | 7 |
| Agents | 18 |
| Skills | 13 |
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

## Agent Collaboration Flow

```
New Feature (Full Pipeline):
  product-agent → ux-agent → ui-agent → frontend-agent + backend-agent → qa-agent → devops-agent → marketing-agent

Security Review:
  security-auditor → backend-agent → qa-agent

Incident Response:
  incident-responder → devops-agent → cloud-architect

Growth Sprint:
  seo-keyword-strategist → seo-content-writer → marketing-agent → data-analyst
```
