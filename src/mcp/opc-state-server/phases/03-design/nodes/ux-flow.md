---
name: ux-flow
tags: [ui, frontend]
description: 信息架构、导航与核心交互流（user flow）
agents:
  primary: [ui-designer]
  fallback: [ux-researcher, product-manager]
input:
  - path: <unit>/<feature>/prd
    type: knowledge
  - path: <unit>/<feature>/personas
    type: knowledge
output:
  - path: design/<feature>/ux-flow
    type: knowledge
  - path: design/<feature>/ia
    type: knowledge
quality_gates:
  L1: []
  L2: [primary_flows_covered, error_paths_covered, navigation_consistent]
always_show: true
---

## 交互流节点

定义信息架构（IA）、导航结构与关键 user flow（含异常路径），是 ui-design 的逻辑骨架。

### 何时被选中

- scenario = `greenfield` / `new-product`
- 任务涉及多页面 / 多步骤流程（注册、下单、配置向导等）

### 何时跳过

- 单页应用 + 单一交互（如纯展示组件）
- 仅修改既有 flow 的视觉（直接 ui-design）

### 执行步骤

1. **信息架构**：把 PRD 的功能/内容归类成层级（≤ 3 层导航深度为佳）。
2. **导航选型**：tab / drawer / breadcrumb / wizard；选型理由必须引用 persona 行为特征。
3. **主流程图**：每个 must 流程画一条 happy path（节点 ≤ 7 个，否则拆子流程）。
4. **异常路径**：每条主流程对应 ≥ 1 条 unhappy path（断网 / 校验失败 / 权限不足 / 空数据）。
5. **导航一致性**：列出"用户从 A 到 B 的最短路径"，避免死胡同。
6. **写知识**：`design/<feature>/ux-flow` 含流程图链接（.pen / Miro / Whimsical）；`design/<feature>/ia` 含站点地图。

### Quality Gates

| Layer | Gate | Pass 条件 |
|---|---|---|
| L2 | primary_flows_covered | PRD must 中每个流程都有 happy path |
| L2 | error_paths_covered | 每个 happy path ≥ 1 条 unhappy path |
| L2 | navigation_consistent | 任意两页面间路径 ≤ 3 步 |

### 与 phase 内节点的接口

- 与 `ui-design` 并行，但 ui-design 的页面清单应能覆盖 ux-flow 中所有 step
- 是 04-implement-design 的 `api-design` 的隐式输入（API 端点列表应能服务于 flow）

### 不做的事

- 不做视觉（归 ui-design）
- 不写代码 / 不定义 API（归 04 / 05 phase）
- 不替代用研（flow 反映 persona 行为，不重新做调研）
