---
name: problem-statement
tags: [add-feature, configure]
description: 将模糊想法收敛为可证伪的问题陈述
agents:
  primary: [product-manager]
  fallback: [ux-researcher]
input: []
output:
  - path: <unit>/<feature>/problem-statement
    type: knowledge
quality_gates:
  L1: []
  L2: [falsifiable, scoped]
always_show: true
---

## 问题陈述节点

把"我想做个 XX"转译为可证伪的问题陈述（Who / Pain / Context / Constraint）。

### 何时被选中

- scenario = `greenfield` / `new-product` / `ideation`
- 用户输入中无 PRD / 无 idea-brief 参考

### 何时跳过

- 已有 PRD（直接进入 03-design）
- 任务 scenario ∈ {`fix-bug`, `add-feature`, `refactor`}（在既有产品上增量）

### 执行步骤

1. **用户对话**：澄清动机、目标用户、痛点场景、放弃边界（先验"不做什么"比"做什么"更重要）。
2. **问题模板**：`[谁] 在 [何场景] 遇到 [何痛点]，现有方案 [为何不足]，本产品通过 [何手段] 缓解。`
3. **可证伪检验**：陈述必须可被市场数据/用户访谈反驳；否则回到第 1 步细化。
4. **范围界定**：列出 in-scope 与 out-of-scope，避免后续阶段范围漂移。
5. **写知识**：`<unit>/<feature>/problem-statement` 持久化（含 falsifiable_hypotheses 列表）。

### Quality Gates

| Layer | Gate | Pass 条件 |
|---|---|---|
| L2 | falsifiable | 陈述中至少 1 条可证伪假设 |
| L2 | scoped | in-scope / out-of-scope 各有 ≥ 3 条 |

### 不做的事

- 不做技术选型（归 03-design / 04-implement-design）
- 不写 PRD（归 01-validation 的 `prd-draft` 节点）
- 不分析竞品（归 01-validation 的 `competitor-analysis`）
