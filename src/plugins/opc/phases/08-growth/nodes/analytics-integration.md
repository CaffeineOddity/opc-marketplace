---
name: analytics-integration
tags: [frontend, backend]
description: 事件埋点、漏斗、留存、归因
agents:
  primary: [frontend-developer]
  fallback: [backend-engineer, performance-engineer]
input:
  - path: <unit>/<feature>/prd
    type: knowledge
  - path: design/<feature>/ux-flow
    type: knowledge
  - path: <unit>/<feature>/marketing-content
    type: knowledge
output:
  - path: <unit>/<feature>/analytics
    type: knowledge
  - path: src/analytics/
    type: artifact
quality_gates:
  L1: [build, lint, unit-test]
  L2: [events_schema_versioned, funnels_defined, attribution_model_chosen]
always_show: false
---

## 分析与埋点节点

为产品 / 营销内容接入事件埋点，建立漏斗、留存、归因分析。

### 何时被选中

- 任务进入 08-growth
- 任何需要量化用户行为的场景（增长 / AB 实验）

### 何时跳过

- 仅服务端 batch 任务 / 无用户交互的服务

### 执行步骤

1. **事件清单**：基于 ux-flow 主要节点 + marketing CTA 派生事件名（命名约定 `<object>_<action>`，如 `signup_submitted`）。
2. **schema 版本化**：每事件含 schema 版本号；变更非破坏式（加字段可，删字段需 v+1）。
3. **漏斗定义**：注册 / 激活 / 留存 / 转化各一条；明确分子分母。
4. **归因模型**：last-touch / first-touch / linear / time-decay；选型理由记录。
5. **接入 SDK / 后端**：前端 SDK + 后端校验；杜绝裸写 console.log 当埋点。
6. **写知识**：`analytics` 含事件字典 + 漏斗 + 归因模型 + dashboard 链接。

### Quality Gates

| Layer | Gate | Pass 条件 |
|---|---|---|
| L1 | build / lint / unit-test | 同其他 5-implement 标准 |
| L2 | events_schema_versioned | 每事件含 schema 版本号 |
| L2 | funnels_defined | ≥ 1 条注册/激活/转化漏斗 |
| L2 | attribution_model_chosen | 模型选型有书面理由 |

### 与 phase 内节点的接口

- 与 `marketing-content` 双向：marketing 出 CTA，本节点出埋点
- 是 09-scale `performance-profiling` 的隐式输入（用户行为数据反哺性能优化决策）

### 不做的事

- 不做 BI 报表搭建（仅产出原始数据 + 基础漏斗）
- 不做用研（量化 ≠ 解释；质性研究归 01-validation）
- 不替代 PII 合规审查（归专项 compliance-audit 节点）
