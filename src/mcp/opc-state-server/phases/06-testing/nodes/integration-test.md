---
name: integration-test
tags: [backend, frontend, fullstack]
description: 集成测试 + E2E 测试（跨模块/跨服务/端到端用户流）
agents:
  primary: [test-automator]
  fallback: [qa-expert, fullstack-engineer]
input:
  - path: <unit>/<feature>/api
    type: knowledge
  - path: <unit>/<feature>/architecture
    type: knowledge
output:
  - path: tests/integration/
    type: artifact
  - path: tests/e2e/
    type: artifact
  - path: <unit>/<feature>/test-report
    type: knowledge
quality_gates:
  L1: [build, integration-test, e2e-test]
  L2: [test_pass, coverage_threshold]
always_show: true
---

## 集成测试节点

跨模块 / 跨服务 / 端到端的功能验证。**与 05-implement 的单元测试互补**：单测覆盖函数级，本节点覆盖系统级。

### 何时被选中

- 几乎所有任务（`always_show: true`）；只有纯文档/配置改动可跳过
- scenario ∈ {`add-feature`, `fix-bug`, `refactor`, `migrate`}

### 何时跳过

- 任务仅改文档 / 注释 / 非运行配置
- 用户介入显式 `skip_testing`（需在 brief 中记录原因）

### 执行步骤

1. **加载契约**：`opc_knowledge_get_batch` 取 api + architecture (min_version: 1)。
2. **集成测试**：跨模块场景（service ↔ repository ↔ DB；service ↔ external API mock）。
3. **E2E 测试**：用户视角的完整流（登录 → 操作 → 退出；下单 → 支付 → 回执）。
4. **覆盖率**：基于 PRD 验收线设定阈值（典型 ≥ 70% 行覆盖；关键路径 100%）。
5. **写知识**：`<unit>/<feature>/test-report` 记录通过用例数、失败用例、覆盖率、性能样本。

### Quality Gates

| Layer | Gate | Pass 条件 |
|---|---|---|
| L1 | build | 编译通过 |
| L1 | integration-test | 集成测试套件全绿 |
| L1 | e2e-test | E2E 套件主路径全绿（边界路径允许 known-fail 列表） |
| L2 | test_pass | 全部 L1 测试 PASS |
| L2 | coverage_threshold | 覆盖率 ≥ PRD 设定阈值 |

### 与 phase 内节点的接口

- 与 `security-scan` 互不依赖（可并行）
- 与 `quality-gate` 形成前置：本节点产物 test-report 是 quality-gate 的输入之一

### 不做的事

- 不做单元测试（归 05-implement 的 `tdd-implementation` / `backend-endpoint` / `frontend-component`）
- 不做安全扫描（归本 phase 的 `security-scan` 节点）
- 不做性能基线最终判定（归 `quality-gate` 节点）
- 不修代码（发现 bug → `opc_node_finish({status:'failed'})` 让 05-implement 重做对应节点）
