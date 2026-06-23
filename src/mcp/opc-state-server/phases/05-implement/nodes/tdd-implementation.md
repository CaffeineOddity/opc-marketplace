---
name: tdd-implementation
tags: [backend, database]
description: TDD 驱动的后端功能实现（红-绿-重构）
agents:
  primary: [backend-engineer]
  fallback: []
input:
  - path: <unit>/<feature>/api
    type: knowledge
  - path: <unit>/<feature>/model
    type: knowledge
  - path: <unit>/<feature>/architecture
    type: knowledge
output:
  - path: src/
    type: artifact
  - path: tests/
    type: artifact
quality_gates:
  L1: [build, lint, unit-test]
  L2: [test_pass, lint_pass]
always_show: false
---

## TDD 实现节点

按照红-绿-重构循环实现 04-implement-design 阶段冻结的 API 契约与数据库 schema。

### 执行步骤

1. **加载契约**：`opc_knowledge_get_batch` 拿到所有相关 `<unit>/<feature>/api` + `model` + `architecture`，验证 `min_version ≥ 1`。
2. **RED**：为每个 endpoint 写测试（先写 negative case，再写 happy path），运行测试 → 全红。
3. **GREEN**：最小实现让测试通过；禁止"为了通过而扩展未声明的契约"。
4. **REFACTOR**：提取公共逻辑、改善命名、消除重复；每次重构后再跑测试 → 仍然全绿。
5. **Lint + typecheck**：必须 0 errors。
6. **Evidence**：汇报 `test_results.{passed, failed, skipped}` + `lint_results.{errors, warnings}` + `files_created[]`。

### Quality Gates

| Layer | Gate | Pass 条件 |
|---|---|---|
| L1 (node) | build | 编译/打包成功 |
| L1 (node) | lint | 0 errors（warnings 允许） |
| L1 (node) | unit-test | 退出码 0 |
| L2 (phase) | test_pass | 所有节点的 `evidence.test_results.failed === 0` |
| L2 (phase) | lint_pass | 所有节点的 `evidence.lint_results.errors === 0` |

L1 在 `opc_node_complete` 触发；L2 在 `opc_phase_complete` 汇总。

### 与上下游节点的接口

- 上游 (`api-design` / `database-schema`)：禁止反向修改契约。若必须改，调 `opc_phase_reset({phase:"04-implement-design"})` 走 git checkout + v+1。
- 同 phase (`auth-integration` / `security-review`)：常发生 artifact 路径冲突 (`src/auth/`)，由 node-resolver 自动降级为串行（同一 group）。
- 下游 (`06-testing`)：本节点产物（src + tests）由集成测试节点验证。

### 不做的事

- 不修改 API 契约文件（`<unit>/<feature>/api`）
- 不写真实数据库迁移之外的 schema 变更
- 不做端到端测试（归 `integration-test` 节点）
