---
name: frontend-component
tags: [frontend, ui]
description: 实现前端组件（页面、表单、状态管理）
agents:
  primary: [frontend-developer]
  fallback: [fullstack-engineer]
input:
  - path: <unit>/<feature>/api
    type: knowledge
  - path: design/<feature>/ui
    type: knowledge
output:
  - path: src/components/
    type: artifact
  - path: src/pages/
    type: artifact
  - path: tests/components/
    type: artifact
quality_gates:
  L1: [build, lint, unit-test]
  L2: [test_pass, lint_pass]
always_show: false
---

## 前端组件实现节点

依据 03-design 产出的 UI/UX 设计与 04-implement-design 产出的 API 契约实现前端组件。

### 执行步骤

1. **加载契约**：`opc_knowledge_get_batch` 拿到 API + UI 设计稿引用。
2. **构建组件树**：原子组件 → 组合组件 → 页面级容器。
3. **状态管理**：选型（local state / context / Redux / Zustand），与 API 客户端层（fetch / axios / SWR / React Query）对接。
4. **测试**：组件单元测试（Vitest / Jest + React Testing Library）+ 关键交互测试。
5. **Lint + typecheck**。

### 何时被选中

- 任务 tags 包含 `frontend` / `ui` / `fullstack`

### 何时跳过

- 任务 tags 只有 `backend` / `database`（纯后端任务）

### 不做的事

- 不修改 API 契约
- 不做视觉设计（归 `03-design` 的 `ui-design` 节点）
- 不做 E2E 测试（归 `06-testing` 的 `integration-test`）
