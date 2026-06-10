---
name: feasibility-analysis
tags: [add-feature, configure]
description: 技术 / 商业 / 资源三维可行性评估
agents:
  primary: [product-manager]
  fallback: [tech-lead, business-analyst]
input:
  - path: <unit>/<feature>/problem-statement
    type: knowledge
output:
  - path: <unit>/<feature>/feasibility
    type: knowledge
  - path: <unit>/<feature>/risks
    type: knowledge
quality_gates:
  L1: []
  L2: [three_dim_covered, risks_actionable]
always_show: true
---

## 可行性分析节点

对 problem-statement 做三维评估，决定是否进入 01-validation 投入正式资源。

### 何时被选中

- 跟随 `problem-statement`（blocked_by）
- scenario = `greenfield` / `new-product`

### 何时跳过

- 增量任务（既有产品；可行性已隐含通过）

### 执行步骤

1. **技术可行性**：是否有现成技术栈支撑；新颖部分是否 prototype 验证过；性能上限是否满足设想。
2. **商业可行性**：目标用户付费意愿（或 ARPU 推断）；商业模式（订阅 / 抽佣 / 增值）；触达渠道成本。
3. **资源可行性**：所需团队角色与人数；预算与时间窗（重要：是否有刚性 deadline）；外部依赖（合规许可、API 配额）。
4. **风险登记**：对每一维写明 ≥ 1 条高风险 + 缓解方案（不可缓解 → no-go）。
5. **结论**：`go` / `pivot` / `no-go`；pivot 时回到 `problem-statement` 调整范围。

### Quality Gates

| Layer | Gate | Pass 条件 |
|---|---|---|
| L2 | three_dim_covered | 技术/商业/资源三维都有结论与依据 |
| L2 | risks_actionable | 每条风险都有 owner + 缓解动作 |

### 不做的事

- 不做产品规划细节（归 PRD）
- 不写代码原型（如需 spike，建议在 04-implement-design 拉子 pipeline）
- 不替代法务/合规审查（仅识别风险并标记 owner）
