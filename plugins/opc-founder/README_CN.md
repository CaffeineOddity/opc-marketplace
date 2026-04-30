# opc-founder

一人公司编排器插件 —— 协调所有其他代理完成完整产品生命周期的 CEO 代理。

## 组件

### 技能

| 技能 | 描述 |
|------|------|
| `/opc` | 一键入口 —— 自动评估任务并编排代理 |
| `/install` | 安装 OPC 插件 —— 全量安装、按需安装或自定义选择 |

### 代理

| 代理 | 模型 | 描述 |
|------|------|------|
| founder-agent | opus | CEO 代理，支持 4 种编排模式 |

## 快速开始

```shell
/opc <任务描述>
```

### 示例

| 命令 | 执行内容 |
|------|----------|
| `/opc build a user management feature` | 完整流水线：产品 → 设计 → 开发 → 测试 → 发布 |
| `/opc research the competitor landscape` | 派遣 product-agent 进行调研 |
| `/opc fix this bug` | 并行：开发 + 测试代理 |
| `/opc security audit` | 派遣 security-auditor (opus) |
| `/opc ship the new release` | 顺序：测试 → 运维 → 营销 |

## 插件安装

```shell
/install              # 交互式选择
/install all          # 安装全部 7 个插件
/install web          # Web 产品 (product + design + dev + qa + ship + growth)
/install mobile       # Mobile App (product + design + dev + qa + ship)
/install designer     # 产品设计专注 (product + design + docs)
/install content      # 内容/营销 (product + growth + docs)
/install minimal      # 最小集 (product + dev)
```

## 编排模式

| 模式 | 方法 | 使用场景 |
|------|------|----------|
| **单代理** | 一次 Agent 调用 | 单阶段，单个代理 |
| **流水线** | 顺序 Agent 调用 | 多阶段，有依赖关系 |
| **并行** | 同时调用多个 Agent | 独立任务 |
| **团队** | TeamCreate + TaskCreate + SendMessage | 复杂项目，3+ 代理 |

## 代理网络（29 个代理）

founder-agent 编排 8 个插件中的 29 个专业代理：

| 插件 | 代理 | 阶段 |
|------|------|------|
| **product-kit** | product-agent, startup-analyst, business-analyst | 产品 |
| **design-kit** | brand-agent, web-agent, mobile-agent, design-reviewer | 设计 |
| **dev-kit** | frontend-agent, backend-agent, backend-architect, security-auditor, mobile-developer, database-architect, performance-engineer, ai-engineer, prompt-engineer, technical-writer | 开发 |
| **qa-kit** | qa-agent, accessibility-expert | 测试 |
| **ship-kit** | devops-agent, cloud-architect, incident-responder | 发布 |
| **growth-kit** | marketing-agent, data-analyst, seo-keyword-strategist, seo-content-writer, seo-content-planner | 增长 |
| **docs-kit** | docs-agent | 文档 |

## 工作流模式

### 新功能（完整流水线）

```
阶段 1: product-agent → 调研 + 需求
阶段 2: brand-agent → web-agent → design-reviewer → 设计规范
阶段 3: frontend-agent + backend-agent (并行) → 实现
阶段 4: qa-agent → security-auditor → 验证
阶段 5: devops-agent → 部署
阶段 6: marketing-agent → 发布
```

### 安全审查

```
security-auditor (opus) → 审计发现
    → backend-agent → 修复后端问题
    → frontend-agent → 修复前端问题
    → qa-agent → 验证修复
```

### 事故响应

```
incident-responder → 分类 + 诊断
    → devops-agent → 缓解措施
    → cloud-architect → 基础设施变更
```

### 增长冲刺

```
seo-keyword-strategist → seo-content-planner → seo-content-writer → marketing-agent
```
