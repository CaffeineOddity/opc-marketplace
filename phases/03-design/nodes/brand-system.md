---
name: brand-system
tags: [ui, configure]
description: 设计 token、色板、字号、间距、组件库基线
agents:
  primary: [ui-designer]
  fallback: [design-bridge, frontend-developer]
input:
  - path: <unit>/<feature>/prd
    type: knowledge
output:
  - path: design/<feature>/brand-system
    type: knowledge
  - path: design/<feature>/tokens
    type: knowledge
quality_gates:
  L1: []
  L2: [tokens_complete, naming_scaled, dark_mode_supported]
always_show: false
---

## 品牌系统节点

为本 feature/product 建立可复用的设计 token 集合，是 ui-design 的依赖前置。

### 何时被选中

- scenario = `greenfield` / `new-product`（新建品牌）
- 任务包含 `brand` 或 `redesign` 关键词
- 已有品牌但 unit 内尚未建 brand-system 知识

### 何时跳过

- 已有等效 brand-system 知识（直接引用，不重建）
- 纯后端任务

### 执行步骤

1. **加载 PRD**：理解产品调性（专业 / 活泼 / 极简 / 高密度信息）。
2. **色板**：primary / secondary / accent / neutral 各 ≥ 5 级；含 dark mode 对应色。
3. **字号阶梯**：≥ 6 级（h1-h4 + body + caption），含行高与字重。
4. **间距 / 圆角 / 阴影**：4 / 8 / 16 / 24 / 32px 阶梯；圆角 0/2/4/8/16；shadow 3 级。
5. **图标 / 插画**：来源（Lucide / Heroicons / 自绘）；统一笔画粗细。
6. **写知识**：`brand-system` 含文字描述与示例；`tokens` 含 JSON/CSS variables 格式可直接消费。

### Quality Gates

| Layer | Gate | Pass 条件 |
|---|---|---|
| L2 | tokens_complete | 色 / 字 / 间距 / 圆角 / 阴影五类齐备 |
| L2 | naming_scaled | token 命名遵循 `<category>-<scale>` (如 `color-primary-500`) |
| L2 | dark_mode_supported | 每个色 token 有 light + dark 双值 |

### 与 phase 内节点的接口

- 是 `ui-design` 的强依赖（blocked_by 隐式）
- 与 `ux-flow` 互不依赖（可并行）

### 不做的事

- 不画具体页面（归 ui-design）
- 不实现组件代码（归 05-implement 的 frontend-component）
- 不做用研（颜色 / 字号偏好若需调研，归 01-validation）
