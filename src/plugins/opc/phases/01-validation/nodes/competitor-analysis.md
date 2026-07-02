---
name: competitor-analysis
tags: [add-feature, configure]
description: 竞品定位、差异化、市场容量、合规约束调研
agents:
  primary: [business-analyst]
  fallback: [product-manager]
input:
  - path: <unit>/<feature>/problem-statement
    type: knowledge
output:
  - path: <unit>/<feature>/competitor-analysis
    type: knowledge
quality_gates:
  L1: []
  L2: [competitors_covered, differentiation_clear]
always_show: false
---

## 竞品分析节点

调研直接 / 间接竞品，明确差异化机会与合规边界。

### 何时被选中

- scenario = `greenfield` / `new-product`
- 任务包含 `validation` / `market-research` tag

### 何时跳过

- 内部工具 / 无竞品场景
- 增量优化（差异化早已确立）

### 执行步骤

1. **竞品名单**：直接竞品 ≥ 3，间接 / 替代品 ≥ 2。
2. **矩阵对比**：功能、定价、用户口碑（评分 / 评论摘要）、技术栈推测、增长态势。
3. **差异化定位**：本产品的 unique value proposition，必须明确"我们不做什么"（反例：不做企业级 SSO）。
4. **合规与市场容量**：目标地区监管（GDPR / HIPAA / 网信办等）、TAM/SAM/SOM 估算。
5. **写知识**：`competitor-analysis` 一份产物，含矩阵 + UVP + 合规清单。

### Quality Gates

| Layer | Gate | Pass 条件 |
|---|---|---|
| L2 | competitors_covered | 直接 ≥ 3 + 间接 ≥ 2 |
| L2 | differentiation_clear | UVP + "不做什么"清单各 ≥ 3 条 |

### 不做的事

- 不做产品规划（归 `prd-draft`）
- 不做技术选型（归 03-design）
- 不臆造数据（数据来源必须可追溯：官网 / 财报 / 第三方报告链接）
