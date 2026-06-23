---
name: prd-draft
tags: [add-feature, api]
description: 产品需求文档（PRD）起草：goal / must / should / could + 验收线
agents:
  primary: [product-manager]
  fallback: []
input:
  - path: <unit>/<feature>/user-research
    type: knowledge
  - path: <unit>/<feature>/personas
    type: knowledge
  - path: <unit>/<feature>/competitor-analysis
    type: knowledge
output:
  - path: <unit>/<feature>/prd
    type: knowledge
quality_gates:
  L1: []
  L2: [moscow_classified, acceptance_measurable, risks_linked]
always_show: true
---

## PRD 起草节点

把 01-validation 的全部输入收敛成单一 PRD，作为 03-design 起点。

### 何时被选中

- scenario = `greenfield` / `new-product` / `feature-with-spec`
- 跟随 `user-research`（blocked_by；competitor-analysis 可选）

### 何时跳过

- 任务已有外部 PRD 引用（直接 link 即可）
- 纯技术 refactor / bug-fix（无产品语义变化）

### 执行步骤

1. **背景**：从 problem-statement 抽取，2 段以内。
2. **目标 + 非目标**：goal 必须可被 acceptance 度量；non-goal 显式声明（防止后续范围漂移）。
3. **MoSCoW 分级**：must / should / could / wont；must 是 03-design 的硬约束。
4. **验收线**：每条 must 必须配 measurable 验收条件（响应时间 / 转化率 / 错误率等）。
5. **风险链接**：引用 `feasibility/risks` 中相关条目；新增风险 → 反写回 risks 知识。
6. **写知识**：`prd` 持久化；触发 phase_confirm → 进入 03-design。

### Quality Gates

| Layer | Gate | Pass 条件 |
|---|---|---|
| L2 | moscow_classified | 每条需求都有 must/should/could/wont 标签 |
| L2 | acceptance_measurable | 每条 must 有数值或布尔验收 |
| L2 | risks_linked | PRD 与 risks 知识双向引用 |

### 不做的事

- 不做 UI 设计（归 03-design 的 `ui-design`）
- 不做技术架构（归 04-implement-design）
- 不做实现估时（估时归 04-implement-design 的 brief 阶段）
- 不替代 user-research（PRD 引用调研结论，不重新做调研）
