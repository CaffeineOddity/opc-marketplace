---
name: marketing-content
tags: [ui, frontend]
description: 营销文案、落地页、邮件序列（与 brand-system 一致）
agents:
  primary: [ui-designer]
  fallback: [product-manager, frontend-developer]
input:
  - path: <unit>/<feature>/prd
    type: knowledge
  - path: <unit>/<feature>/personas
    type: knowledge
  - path: design/<feature>/brand-system
    type: knowledge
output:
  - path: <unit>/<feature>/marketing-content
    type: knowledge
  - path: marketing/
    type: artifact
quality_gates:
  L1: []
  L2: [persona_targeted, brand_consistent, cta_measurable]
always_show: false
---

## 营销内容节点

为目标 persona 撰写文案 / 落地页 / 邮件序列，与品牌系统一致，含可度量 CTA。

### 何时被选中

- 任务进入 08-growth
- 任务 tags 包含 `marketing` / `content`

### 何时跳过

- 内部工具 / B2B 定制项目（无公开营销需求）

### 执行步骤

1. **加载契约**：personas（受众）+ brand-system（视觉/语调）+ prd（卖点）。
2. **价值阶梯**：hero → 痛点 → 解决方案 → 社会证明 → CTA。
3. **文案风格**：与 brand voice 一致（专业 / 活泼 / 极简）；不堆砌形容词。
4. **CTA**：每条内容含 ≥ 1 个可度量动作（点击 / 注册 / 试用 / 联系销售）。
5. **A/B 假设**：标题 / hero 图 / CTA copy 三选一作为实验变量。
6. **写知识**：`marketing-content` 含文案 + 落地页 link + CTA 度量定义。

### Quality Gates

| Layer | Gate | Pass 条件 |
|---|---|---|
| L2 | persona_targeted | 每条内容标注目标 persona |
| L2 | brand_consistent | 视觉与文字风格符合 brand-system |
| L2 | cta_measurable | CTA 有事件埋点对应 |

### 与 phase 内节点的接口

- 与 `analytics-integration` 强配合：CTA 埋点由 analytics 落地
- 与 `seo-audit` 互补：seo 保证可发现，content 保证可转化

### 不做的事

- 不做视觉设计系统（归 03-design 的 brand-system）
- 不做埋点实现（归 analytics-integration）
- 不替代用研（persona 来自 01-validation）
