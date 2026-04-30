# opc-founder

> [中文](#中文) | **English**

One-person company orchestrator plugin — the CEO agent that coordinates all other agents across the full product lifecycle.

## Components

### Skills

| Skill | Description |
|-------|-------------|
| `/opc` | One-command entry point — auto-assess task and orchestrate agents |

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

## Agent Network (30 Agents)

The founder-agent orchestrates 30 specialized agents across 8 plugins:

| Plugin | Agents | Stage |
|--------|--------|-------|
| **product-kit** | product-agent, startup-analyst, business-analyst | Product |
| **design-kit** | ux-agent, ui-agent, ui-ux-designer, design-system-architect, ux-researcher | Design |
| **dev-kit** | frontend-agent, backend-agent, backend-architect, security-auditor, mobile-developer, database-architect, performance-engineer, ai-engineer, prompt-engineer, technical-writer | Development |
| **qa-kit** | qa-agent, accessibility-expert | Quality |
| **ship-kit** | devops-agent, cloud-architect, incident-responder | Ship |
| **growth-kit** | marketing-agent, data-analyst, seo-keyword-strategist, seo-content-writer, seo-content-planner | Growth |
| **docs-kit** | docs-agent | Documents |

## Workflow Patterns

### New Feature (Full Pipeline)

```
Stage 1: product-agent → research + requirements
Stage 2: ux-agent → ui-agent → design specs
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

---

## 中文

一人公司编排器插件 —— 协调所有其他代理完成完整产品生命周期的 CEO 代理。

## 组件

### 技能

| 技能 | 描述 |
|------|------|
| `/opc` | 一键入口 —— 自动评估任务并编排代理 |

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

## 编排模式

| 模式 | 方法 | 使用场景 |
|------|------|----------|
| **单代理** | 一次 Agent 调用 | 单阶段，单个代理 |
| **流水线** | 顺序 Agent 调用 | 多阶段，有依赖关系 |
| **并行** | 同时调用多个 Agent | 独立任务 |
| **团队** | TeamCreate + TaskCreate + SendMessage | 复杂项目，3+ 代理 |

## 工作流模式

### 新功能（完整流水线）

```
阶段 1: product-agent → 调研 + 需求
阶段 2: ux-agent → ui-agent → 设计规范
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
