---
name: ui-design
tags: [ui, frontend]
description: 高保真 UI 稿与组件库基线（视觉层）
agents:
  primary: [ui-designer]
  fallback: [frontend-developer, design-bridge]
input:
  - path: <unit>/<feature>/prd
    type: knowledge
  - path: <unit>/<feature>/personas
    type: knowledge
  - path: <unit>/<feature>/brand-system
    type: knowledge
output:
  - path: design/<feature>/ui
    type: knowledge
  - path: design/<feature>/components
    type: knowledge
quality_gates:
  L1: []
  L2: [pages_covered, tokens_referenced, a11y_baseline]
always_show: true
---

## UI 设计节点

把 PRD 中的关键页面落成可被前端实现的高保真视觉稿与组件清单。

### 何时被选中

- scenario = `greenfield` / `new-product` / `add-feature`（含 UI）
- 任务 tags 包含 `ui` / `frontend`

### 何时跳过

- 纯后端任务（无 UI 变更）
- 任务 tags 只含 `backend` / `database` / `infra`

### 执行步骤

1. **加载契约**：`opc_knowledge_get_batch` 取 prd + personas + brand-system（若 brand 已建）。
2. **页面清单**：从 PRD must 列表派生关键页面（典型 5-15 个），区分主流程 / 边缘页 / 空状态 / 错误态。
3. **线框 → 高保真**：先线框对齐结构（用 pencil .pen 文件管理），再上色与排版。
4. **组件抽取**：≥ 80% 元素复用 brand-system tokens；新组件回写 components 知识。
5. **可访问性基线**：颜色对比 ≥ WCAG AA；可点击区域 ≥ 44×44pt；键盘可达。
6. **写知识**：`design/<feature>/ui` 与 `design/<feature>/components` 双产出，含 .pen 文件路径或 Figma link 引用。

### Quality Gates

| Layer | Gate | Pass 条件 |
|---|---|---|
| L2 | pages_covered | PRD must 列表中每条均有对应稿件 |
| L2 | tokens_referenced | 稿件复用 brand-system tokens ≥ 80% |
| L2 | a11y_baseline | 颜色对比 + 触达大小通过抽查 |

### 与 phase 内节点的接口

- 强依赖 `brand-system`（blocked_by）；若 brand 缺失，先调起 brand-system
- 与 `ux-flow` 并行（互不依赖），但视觉细节需与 flow 保持一致

### 不做的事

- 不下沉到 API / DB 字段（归 04-implement-design）
- 不写前端代码（归 05-implement 的 frontend-component）
- 不替代品牌系统建立（归 brand-system）
- 不做用研（归 01-validation 的 user-research）
