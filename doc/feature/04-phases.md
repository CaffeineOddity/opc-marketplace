# 阶段（Phase）

## 9 阶段

```
phases/
├── 00-ideation/                        # 构思 —— 想法验证、可行性分析
│   ├── phase.md                        #   阶段定义
│   ├── nodes.md                        #   选择策略
│   ├── nodes/                          #   节点
│   │   ├── market-research.md
│   │   ├── competitive-analysis.md
│   │   └── opportunity-sizing.md
│   └── templates/
│
├── 01-validation/                      # 验证 —— 市场验证、用户调研
│   ├── phase.md
│   ├── nodes.md
│   ├── nodes/
│   │   ├── user-persona.md
│   │   └── prd-writing.md
│   └── templates/
│       ├── prd-template.md
│       └── persona-template.md
│
├── 03-design/                          # 设计 —— UI/UX、品牌设计
│   ├── phase.md
│   ├── nodes.md
│   ├── nodes/
│   │   ├── wireframe.md
│   │   ├── design-system.md
│   │   ├── web-ui.md
│   │   ├── mobile-ui.md
│   │   ├── brand-identity.md
│   │   ├── interaction-design.md
│   │   └── accessibility-review.md
│   └── templates/
│       ├── design-spec-template.md
│       └── design-system-template.md
│
├── 04-implement-design/                # 实现设计 —— API 设计、数据库 schema、脚手架
│   ├── phase.md
│   ├── nodes.md
│   ├── nodes/
│   │   ├── api-design.md
│   │   ├── database-schema.md
│   │   └── scaffold.md
│   └── templates/
│       ├── architecture-template.md
│       └── api-spec-template.md
│
├── 05-implement/                       # 编码实现 —— 编码、TDD
│   ├── phase.md
│   ├── nodes.md
│   ├── nodes/
│   │   ├── tdd-implementation.md
│   │   ├── frontend-component.md
│   │   ├── backend-endpoint.md
│   │   ├── auth-integration.md
│   │   ├── security-review.md
│   │   ├── performance-optimize.md
│   │   └── dependency-update.md
│   └── templates/
│
├── 06-testing/                         # 测试 —— QA、安全审计
│   ├── phase.md
│   ├── nodes.md
│   ├── nodes/
│   │   └── accessibility-audit.md
│   └── templates/
│
├── 07-release/                         # 发布 —— 部署、CI/CD
│   ├── phase.md
│   ├── nodes.md
│   ├── nodes/
│   │   ├── deployment-setup.md
│   │   └── ci-cd-pipeline.md
│   └── templates/
│
├── 08-growth/                          # 增长 —— 营销、SEO
│   ├── phase.md
│   ├── nodes.md
│   ├── nodes/
│   │   └── seo-optimize.md
│   └── templates/
│
└── 09-scale/                           # 规模化 —— 性能优化、架构演进
    ├── phase.md
    ├── nodes.md
    ├── nodes/
    │   └── architecture-evolve.md
    └── templates/
```

每个阶段目录自包含：phase.md + nodes.md + nodes/ + templates/。

---

## phase.md

阶段元信息。定义阶段的目标和前后关系。以 04-implement-design 为例：

```markdown
---
phase: 04-implement-design
name: 实现设计
description: API 设计、数据库 schema、脚手架搭建

order:
  prev: 03-design
  next: 05-implement

---

## 目标
基于任务简报（读取 pipeline 目录下 `brief.md`）完成 API 设计、数据库建模和项目脚手架。

## 职责
- 读取 brief 理解任务目标、约束和已有知识状态
- 设计 API 端点、数据库 schema
- 搭建项目脚手架，为编码阶段做准备
- 所有选中节点执行完毕后进入下一阶段
```

---

## nodes.md

`opc_phase_start` 在启动每个 phase 时扫描 `platform/opc-orchestrator/pipeline/` + `phases/<phase>/nodes/` 和项目 `opc-nodes/` 对应目录，自动填充节点列表。nodes.md 定义选择策略和反思配置。

### 反思轮次

每个 phase 根据自己的节点数量和决策复杂度，独立配置 `max_reflection_rounds`。复杂度只影响该轮次的推进方式（自动/手动），不覆盖 phase 自己的反思上限：

| Phase | 节点数 | medium | high | 理由 |
|-------|--------|--------|------|------|
| 00-ideation | 3 | 4 | 6 | 方向性探索，需要多轮试错 |
| 01-validation | 2 | 2 | 4 | PRD/画像，少量关键决策 |
| 03-design | 7 | 3 | 5 | UI/UX 视觉决策需迭代对比 |
| 04-implement-design | 3 | 2 | 4 | API/DB 设计决策关键，节点少 |
| 05-implement | 7 | 3 | 5 | 节点最多，依赖链长 |
| 06-testing | 1 | 1 | 2 | 验证性为主，节点少 |
| 07-release | 2 | 1 | 2 | 操作性强，决策空间小 |
| 08-growth | 1 | 2 | 3 | 营销/SEO 策略需要权衡 |
| 09-scale | 1 | 2 | 4 | 架构演进影响面大 |

> low 复杂度不走管线，不在表中。

各 phase 的 `nodes.md` 声明自己的值。以 04-implement-design 为例：

```markdown
---
phase: 04-implement-design
phase_review:
  require_user_approval: true
  max_reflection_rounds:
    medium: 2
    high: 4
---

## 选择规则

### 1. tag 交集过滤
任务 tags 与每个节点 tags 求交集。交集为 0 的节点默认排除（除非标记 `always_show: true`）。

### 2. 语义匹配排序
剩余节点按 description 与任务描述的语义相似度降序排列。

### 3. Scenario 加权
命中 scenario 推荐的节点获得 +0.3 权重加成。

## 阶段推进

### 高置信度自动推进

当前 phase 完成时，结合 complexity 检查下一 phase：

| complexity | 条件 | 行为 |
|-----------|------|------|
| low | — | 不走管线，无 phase 概念，Agent 直接执行 |
| medium | scenario 命中 + 语义相似度 > 0.9 | 自动推进 |
| medium | 其他 | 提示用户确认后推进 |
| high | 任意条件 | 每阶段需用户主动确认 |

### 手动回退

用户可通过 `/opc-phase back <phase>` 回退。回退后：
- 回退点之后的 knowledge version 降为 0（需重新验证）
- 回退点之后的 node 状态重置为 `pending`

## 节点来源（由 opc_phase_start 自动生成）

`opc_phase_start` 扫描 `platform/opc-orchestrator/pipeline/` + `phases/<phase>/nodes/` 和项目 `opc-nodes/` 对应目录，自动填充节点列表。同名节点项目覆盖内置。

<!-- BEGIN_NODES -->
<!-- END_NODES -->
```

`<!-- BEGIN_NODES -->` 到 `<!-- END_NODES -->` 之间由 `opc_phase_start` 自动注入扫描结果。

