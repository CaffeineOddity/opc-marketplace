---
name: user-research
tags: [add-feature, ui]
description: 用户访谈 / 问卷 / 行为数据收集
agents:
  primary: [ux-researcher]
  fallback: [product-manager]
input:
  - path: <unit>/<feature>/problem-statement
    type: knowledge
output:
  - path: <unit>/<feature>/user-research
    type: knowledge
  - path: <unit>/<feature>/personas
    type: knowledge
quality_gates:
  L1: []
  L2: [sample_size_met, insight_grounded]
always_show: true
---

## 用户调研节点

通过外部信号验证或证伪 problem-statement 中的假设。

### 何时被选中

- scenario = `greenfield` / `new-product` / `feature-validation`
- 任务包含 `validation` tag

### 何时跳过

- 已有近 6 个月内的等效调研（直接引用）
- 增量优化（A/B 即可，不需重新调研）

### 执行步骤

1. **设计研究**：选 1-on-1 访谈（n ≥ 5）或问卷（n ≥ 30），围绕 problem-statement 的 falsifiable_hypotheses 设题。
2. **执行收集**：访谈记录全文 / 问卷原始数据持久化。
3. **主题分析**：编码 → 归并主题 → 引用原话（每条洞察至少 2 条用户原话支撑，杜绝凭空 insight）。
4. **画像沉淀**：≥ 2 个 persona（含目标、行为、关键痛点、采用障碍）。
5. **写知识**：`user-research` + `personas` 两份产物，互相引用。

### Quality Gates

| Layer | Gate | Pass 条件 |
|---|---|---|
| L2 | sample_size_met | 访谈 ≥ 5 OR 问卷 ≥ 30 |
| L2 | insight_grounded | 每条洞察 ≥ 2 条原话引用 |

### 不做的事

- 不臆造数据（违反 M3 CoVe 的 no-fabrication 规则）
- 不做产品决策（仅输出洞察，决策归 `prd-draft`）
- 不做竞品分析（归 `competitor-analysis` 节点）
