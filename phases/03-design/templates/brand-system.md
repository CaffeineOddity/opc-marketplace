# Brand System — <feature-name>

> Phase: 03-design • Node: brand-system
> 模板：色 / 字 / 间距 / 圆角 / 阴影五类齐备；命名遵循 `<category>-<scale>`。

## 1. 调性（来自 PRD 推断）

- **关键词**：<专业 / 活泼 / 极简 / 高密度 等 ≤ 3 个>
- **参考品牌**（仅做调性对标，非抄袭）：<≤ 3 个>

## 2. 色板

### 2.1 主色系（≥ 5 级）

| Token | Light | Dark |
|---|---|---|
| color-primary-50  | #...... | #...... |
| color-primary-100 | #...... | #...... |
| color-primary-500 | #...... | #...... |
| color-primary-700 | #...... | #...... |
| color-primary-900 | #...... | #...... |

### 2.2 中性色（≥ 5 级）

| Token | Light | Dark |
|---|---|---|
| color-neutral-50  | #...... | #...... |
| color-neutral-500 | #...... | #...... |
| color-neutral-900 | #...... | #...... |

### 2.3 语义色

| Token | Light | Dark | 用途 |
|---|---|---|---|
| color-success | #...... | #...... | 成功 / 通过 |
| color-warning | #...... | #...... | 警告 / 待处理 |
| color-danger  | #...... | #...... | 错误 / 危险 |

## 3. 字号阶梯（≥ 6 级）

| Token | Size / Line-height / Weight | 用途 |
|---|---|---|
| font-h1 | 32 / 40 / 700 | 一级标题 |
| font-h2 | 24 / 32 / 600 | 二级标题 |
| font-h3 | 20 / 28 / 600 | 三级标题 |
| font-body | 14 / 22 / 400 | 正文 |
| font-caption | 12 / 18 / 400 | 辅助 |

## 4. 间距 / 圆角 / 阴影

- **间距**：4 / 8 / 16 / 24 / 32 / 48 px
- **圆角**：0 / 2 / 4 / 8 / 16 px
- **阴影**：3 级（轻 / 中 / 重）

## 5. 图标 / 插画

- 来源：<Lucide / Heroicons / 自绘>
- 笔画粗细：<1.5px 统一>

## 6. 可访问性

- 颜色对比：所有正文颜色对纯色背景 ≥ 4.5:1（WCAG AA）
- 字号最小：12px

---
*下游节点：ui-design（同 phase）；marketing-content（08-growth）。token JSON 见 tokens.md。*
