# caffeine/opc-marketplace

Caffeine 的一人公司 Claude Code 插件市场 — **29 个 Agent、49 个 Skill、2 个 Hook**，覆盖完整产品生命周期。

> **中文** | [English](./README.md)

## 快速开始

```shell
/opc <任务描述>    # 一键调度，自动编排 agents
/opc-plugin [命令]     # 管理插件
```

| 命令 | 效果 |
|------|------|
| `/opc 帮我做一个用户管理功能` | 全流程 pipeline |
| `/opc 研究一下竞品市场` | product-agent 调研 |
| `/opc 修复这个 bug` | dev + qa 并行 |
| `/opc 安全审查` | security-auditor |
| `/opc 上线新版本` | qa → devops → marketing |
| `/opc-plugin install all` | 安装全部 7 个插件 |
| `/opc-plugin install web` | 安装 Web 产品所需插件 |
| `/opc-plugin install designer` | 安装产品设计专注插件 |
| `/opc-plugin update` | 更新所有插件 |

## 架构

```
/opc (一键入口) ──→ founder-agent 评估 → 自动编排
  │
  ├── product-kit    需求调研 / 需求撰写 / 头脑风暴 / 市场分析
  ├── design-kit     UX设计 / UI设计 / 设计系统
  ├── dev-kit        架构 / 前端 / 后端 / 安全 / 移动 / 数据库
  ├── qa-kit         测试计划 / 缺陷报告 / E2E测试 / 无障碍审计
  ├── ship-kit       部署 / CI-CD / IaC / 云架构 / 成本 / 事故响应
  └── growth-kit     营销 / 数据分析 / SEO
```

## 插件

### opc-founder — 统帅
| 类型 | 名称 | 描述 |
|------|------|------|
| Skill | `/opc` | 一键入口，自动评估任务并编排 agents |
| Skill | `/opc-plugin` | 管理插件 —— 安装、更新、列表、状态 |
| Agent | founder-agent | CEO agent，4种编排模式（单agent/串行/并行/Team） |

### product-kit — 产品
| 类型 | 名称 | 描述 |
|------|------|------|
| Skill | `/research` | 市场和用户调研 |
| Skill | `/requirement` | 产品需求文档撰写 |
| Skill | `/brainstorm` | 结构化头脑风暴 (SCAMPER/第一性原理/逆向) |
| Agent | product-agent | 产品经理智能体 |
| Agent | startup-analyst | 创业分析师，TAM/SAM/SOM、财务模型、竞争分析 |

### design-kit — 设计
| 类型 | 名称 | 描述 |
|------|------|------|
| Skill | `/ui-design` | UI/UX设计规范生成 |
| Skill | `/ui-ux-pro-max` | 设计系统生成器，50+ 风格、97 色板、57 字体配对 |
| Skill | `/baoyu-imagine` | AI 图像生成（OpenAI、Azure、Google、OpenRouter、DashScope、Replicate） |
| Agent | brand-agent | 品牌设计：品牌策略、视觉识别、Logo、品牌规范 |
| Agent | web-agent | Web设计：响应式设计、Dashboard、Landing Page |
| Agent | mobile-agent | Mobile设计：iOS、Android、React Native、Flutter |
| Agent | design-reviewer | 设计评审：一致性检查、无障碍合规、品牌合规 |
| Reference | ux-design-guide | UX设计原则、用户流程、线框图、可用性启发式 |
| Reference | ui-design-guide | UI设计原则、设计令牌、色彩系统、字体排版 |
| Reference | design-system-guide | 设计系统架构、令牌分类、组件库、主题系统 |
| Reference | ux-research-guide | 用户研究方法、可用性测试、访谈、旅程地图 |
| Reference | brand-design-guide | 品牌设计流程、视觉识别、品牌规范 |
| Reference | design-review-checklist | 设计评审清单、无障碍检查、品牌合规 |

### dev-kit — 开发
| 类型 | 名称 | 描述 |
|------|------|------|
| Skill | `/architect` | 架构设计文档 |
| Skill | `/code-review` | 代码审查 (Bug/安全/性能/可读性) |
| Skill | `/openapi-spec` | OpenAPI 3.1 规范生成 |
| Skill | `/frontend-design` | 生产级前端界面 |
| Skill | `/shadcn-ui` | shadcn/ui 组件集成和定制 |
| Skill | `/mcp-builder` | MCP 服务器开发指南 (Python/TypeScript) |
| Skill | `/systematic-debugging` | 四阶段调试方法论 |
| Skill | `/test-driven-development` | TDD 红绿重构循环 |
| Skill | `/verification-before-completion` | 完成验证协议 |
| Skill | `/baoyu-diagram` | 专业 SVG 图表（架构图、流程图、时序图、思维导图、时间线） |
| Agent | frontend-agent | 前端开发、组件架构、性能优化 |
| Agent | backend-agent | 后端开发、API、数据层、服务架构 |
| Agent | backend-architect | API 设计、微服务、分布式系统 |
| Agent | security-auditor | DevSecOps、OWASP、安全审计 (opus) |
| Agent | mobile-developer | React Native/Flutter/原生开发 |
| Agent | database-architect | 数据建模、Schema设计、迁移规划 |
| Agent | performance-engineer | 性能分析、优化、基准测试 |
| Agent | ai-engineer | AI 系统工程、模型部署、MLOps (opus) |
| Agent | prompt-engineer | 提示词工程、LLM 优化 |
| Agent | technical-writer | 技术文档、API 文档、开发指南 |
| Hook | auto-lint | 文件编辑后自动 lint (eslint/py_compile/go vet/cargo check) |

### qa-kit — 测试
| 类型 | 名称 | 描述 |
|------|------|------|
| Skill | `/test-plan` | 测试计划生成 |
| Skill | `/bug-report` | 结构化缺陷报告 |
| Skill | `/e2e-test` | Playwright/Cypress E2E测试模式 |
| Skill | `/wcag-audit` | WCAG 2.2 无障碍审计 |
| Skill | `/webapp-testing` | Playwright Web 应用测试工具包 |
| Skill | `/a11y-debugging` | 无障碍调试工作流 |
| Skill | `/chrome-devtools` | Chrome DevTools 测试自动化 |
| Agent | qa-agent | QA测试智能体 |
| Agent | accessibility-expert | WCAG 合规、辅助技术、无障碍测试 |

### ship-kit — 上线
| 类型 | 名称 | 描述 |
|------|------|------|
| Skill | `/deploy` | 结构化部署与回滚 |
| Skill | `/ci-pipeline` | GitHub Actions CI/CD模板 |
| Skill | `/changelog` | 自动变更日志 |
| Skill | `/cost-opt` | 云成本优化 (AWS/Azure/GCP/OCI) |
| Skill | `/incident-runbook` | 事故响应手册模板 |
| Skill | `/terraform` | Terraform IaC模块库 |
| Skill | `/troubleshooting` | 系统化故障排查方法论 |
| Agent | devops-agent | 部署、基础设施、运维 |
| Agent | cloud-architect | 多云架构、IaC、FinOps |
| Agent | incident-responder | SRE事故响应、故障排查、事后复盘 |
| Hook | pre-deploy-check | 部署命令安全检查 |

### growth-kit — 增长
| 类型 | 名称 | 描述 |
|------|------|------|
| Skill | `/marketing-plan` | 营销策略与渠道规划 |
| Skill | `/content-create` | 内容创作 (博客/社媒/邮件/案例) |
| Skill | `/baoyu-xhs-images` | 小红书图片卡片系列 |
| Skill | `/baoyu-image-cards` | 社交媒体信息图卡片系列 |
| Skill | `/baoyu-comic` | 知识漫画创作，多种艺术风格 |
| Skill | `/baoyu-cover-image` | 文章封面图，11 色板 × 7 渲染风格 |
| Skill | `/baoyu-article-illustrator` | 文章配图，类型 × 风格 × 色板系统 |
| Skill | `/baoyu-infographic` | 专业信息图，21 布局 × 21 风格 |
| Skill | `/baoyu-youtube-transcript` | 下载 YouTube 字幕和封面 |
| Skill | `/baoyu-post-to-wechat` | 发布到微信公众号 |
| Skill | `/baoyu-post-to-weibo` | 发布到微博 |
| Skill | `/baoyu-post-to-x` | 发布到 X/Twitter |
| Agent | marketing-agent | 营销智能体 |
| Agent | data-analyst | BI数据分析、指标体系、预测分析 |
| Agent | seo-keyword-strategist | 关键词策略、LSI关键词 |
| Agent | seo-content-writer | SEO优化内容写作 |
| Agent | seo-content-planner | 内容日历、话题集群 |

### docs-kit — 文档
| 类型 | 名称 | 描述 |
|------|------|------|
| Skill | `/docx` | Word 文档创建和编辑 |
| Skill | `/pdf` | PDF 处理、合并、拆分、OCR |
| Skill | `/pptx` | PowerPoint 演示文稿生成 |
| Skill | `/baoyu-translate` | 三模式翻译（快翻/普通/精翻），支持术语表 |
| Skill | `/baoyu-slide-deck` | 幻灯片图片生成 |
| Skill | `/baoyu-format-markdown` | Markdown 格式化和美化 |
| Skill | `/baoyu-markdown-to-html` | Markdown 转样式 HTML（微信兼容） |
| Skill | `/baoyu-url-to-markdown` | 抓取 URL 转换为 Markdown |
| Skill | `/baoyu-compress-image` | 图片压缩为 WebP/PNG |
| Agent | docs-agent | 文档生成代理 |

## 统计

| 指标 | 数量 |
|------|------|
| 插件 | 8 |
| Agents | 29 |
| Skills | 50 |
| Hooks | 2 |

## 安装

```shell
# 1. 添加市场
/plugin marketplace add CaffeineOddity/opc-marketplace

# 2. 安装 opc-founder（必需）
/plugin install opc-founder@opc-marketplace

# 3. 使用 /opc-plugin 管理其他插件
/opc-plugin install all        # 安装全部 7 个插件
/opc-plugin install web        # Web 产品
/opc-plugin install designer   # 产品设计专注
/opc-plugin update             # 更新所有插件
/opc-plugin list               # 列出已安装插件
```

### 手动安装（备选）

```shell
/plugin install product-kit@opc-marketplace
/plugin install design-kit@opc-marketplace
/plugin install dev-kit@opc-marketplace
/plugin install qa-kit@opc-marketplace
/plugin install ship-kit@opc-marketplace
/plugin install growth-kit@opc-marketplace
/plugin install docs-kit@opc-marketplace
```

### 更新

```shell
/opc-plugin update              # 更新市场 + 所有插件
/opc-plugin update design-kit   # 更新指定插件
```

## 编排模式

founder-agent 支持四种编排模式，`/opc` 自动选择：

| 模式 | 方式 | 适用场景 |
|------|------|----------|
| Single | Agent tool 单次调度 | 单阶段、单 agent |
| Pipeline | Agent tool 串行多次 | 多阶段、有依赖 |
| Parallel | Agent tool 并行调用 | 独立任务并行 |
| Team | TeamCreate + TaskCreate + SendMessage | 复杂项目、3+ agents |

## Agent 协作流程

```
新功能（全流程）:
  product-agent → brand-agent → web-agent → design-reviewer → frontend-agent + backend-agent → qa-agent → devops-agent → marketing-agent

安全审查:
  security-auditor → backend-agent → qa-agent

事故响应:
  incident-responder → devops-agent → cloud-architect

增长冲刺:
  seo-keyword-strategist → seo-content-planner → seo-content-writer → marketing-agent → data-analyst

移动应用:
  brand-agent → mobile-agent → design-reviewer → mobile-developer → backend-agent → qa-agent
```

## 参与共建

欢迎贡献！这个市场设计为与社区一起成长。

### 贡献方式

- **新增 agent 或 skill** — 添加到现有插件或提议新插件
- **改进现有 agent** — 更好的提示词、更多工具、更紧密的衔接
- **新插件** — 覆盖我们没想到的阶段（如法务、融资、招聘）
- **Bug 修复** — 修复损坏的 agent 或过时的提示词
- **翻译** — 帮助保持文档双语（EN + ZH-CN）

### 如何贡献

1. Fork 本仓库
2. 创建功能分支 (`git checkout -b feature/my-new-agent`)
3. 在 `plugins/` 下添加或修改插件
4. 更新插件的 `plugin.json` 版本号
5. 如新增插件，更新 `marketplace.json`
6. 提交 Pull Request

### 插件结构

```
plugins/your-plugin/
├── .claude-plugin/
│   └── plugin.json          # 插件清单（必需）
├── agents/                   # Agent 定义
│   └── your-agent.md
├── skills/                   # Skill 定义
│   └── your-skill/
│       └── SKILL.md
└── hooks/                    # Hook 定义
    └── hooks.json
```

### 规范

- 每个插件对应一个产品生命周期阶段
- Agent 应聚焦 — 每个 agent 一个明确职责
- Skill 应自包含、可组合
- 所有命名使用 kebab-case
- 修改时递增 `plugin.json` 中的版本号

## 许可证

MIT
