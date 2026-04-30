# product-kit

> [中文](#中文) | **English**

Product stage plugin — research, requirements, brainstorming, and specification for the one-person company.

## Components

### Skills

| Skill | Description |
|-------|-------------|
| `/research` | Market and user research |
| `/requirement` | Product requirements document (PRD) |
| `/brainstorm` | Structured brainstorming (SCAMPER / First Principles / Inversion) |
| `/spec-driven-development` | Define specifications before implementation (SDD + TDD integration) |

### Agents

| Agent | Model | Description |
|-------|-------|-------------|
| product-agent | sonnet | Product manager agent — research, requirements, brainstorming |
| startup-analyst | inherit | TAM/SAM/SOM, financial modeling, competitive analysis |
| business-analyst | sonnet | Business process analysis, requirements elicitation, stakeholder management |

## Quick Start

### Research

```shell
/research <topic>
```

Conducts market research, user interviews, competitive analysis.

### Requirements

```shell
/requirement <feature>
```

Generates structured PRD with:
- Problem statement
- User stories
- Acceptance criteria
- Success metrics

### Brainstorm

```shell
/brainstorm <challenge>
```

Structured ideation using:
- **SCAMPER**: Substitute, Combine, Adapt, Modify, Put to other use, Eliminate, Reverse
- **First Principles**: Break to fundamentals, rebuild
- **Inversion**: What would guarantee failure? Flip it

### Spec-Driven Development

```shell
/spec-driven-development
```

Defines specifications before implementation:
1. Interface Contract (API, request/response)
2. Data Model (entities, constraints)
3. Behavior Rules (business logic)
4. Boundary Conditions (validation, edge cases)

## Workflow Integration

```
/research → /requirement → /spec-driven-development → /architect (dev-kit)
```

### SDD → TDD Flow

```
Spec Definition → Spec Review → Test Derivation → Implementation → Verification
```

## Agent Usage

### product-agent

Use for:
- Market research and analysis
- User story writing
- Feature prioritization
- Product roadmap planning

### startup-analyst

Use for:
- Market sizing (TAM/SAM/SOM)
- Financial projections
- Competitive landscape
- Business model validation

### business-analyst

Use for:
- Process mapping
- Requirements gathering
- Stakeholder analysis
- Gap analysis

## Handoff Protocol

### To design-kit
- Requirements → ux-agent for user flows
- User stories → ui-agent for UI specs

### To dev-kit
- Specifications → /architect for architecture
- API contracts → backend-agent for implementation

---

## 中文

产品阶段插件 —— 一人公司的调研、需求、头脑风暴和规范定义。

## 组件

### 技能

| 技能 | 描述 |
|------|------|
| `/research` | 市场和用户调研 |
| `/requirement` | 产品需求文档 (PRD) |
| `/brainstorm` | 结构化头脑风暴 (SCAMPER / 第一性原理 / 逆向思维) |
| `/spec-driven-development` | 实现前先定义规范 (SDD + TDD 集成) |

### 代理

| 代理 | 模型 | 描述 |
|------|------|------|
| product-agent | sonnet | 产品经理代理 —— 调研、需求、头脑风暴 |
| startup-analyst | inherit | TAM/SAM/SOM、财务模型、竞争分析 |
| business-analyst | sonnet | 业务流程分析、需求获取、干系人管理 |

## 快速开始

### 调研

```shell
/research <主题>
```

执行市场调研、用户访谈、竞争分析。

### 需求

```shell
/requirement <功能>
```

生成结构化 PRD：
- 问题陈述
- 用户故事
- 验收标准
- 成功指标

### 头脑风暴

```shell
/brainstorm <挑战>
```

结构化创意生成：
- **SCAMPER**: 替代、组合、调整、修改、其他用途、消除、逆向
- **第一性原理**: 拆解到基础，重新构建
- **逆向思维**: 什么会导致失败？反转它

### 规范驱动开发

```shell
/spec-driven-development
```

实现前定义规范：
1. 接口契约 (API、请求/响应)
2. 数据模型 (实体、约束)
3. 行为规则 (业务逻辑)
4. 边界条件 (验证、边缘情况)

## 工作流集成

```
/research → /requirement → /spec-driven-development → /architect (dev-kit)
```

### SDD → TDD 流程

```
规范定义 → 规范评审 → 测试推导 → 实现 → 验证
```
