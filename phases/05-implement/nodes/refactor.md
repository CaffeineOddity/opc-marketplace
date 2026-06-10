---
name: refactor
tags: [refactor, backend, frontend]
description: 针对既有代码的结构性重构（非 TDD 红绿循环）
agents:
  primary: [backend-engineer]
  fallback: [frontend-developer, fullstack-engineer]
input:
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

## 重构节点

对既有实现做结构性重构（提取、拆分、合并、命名、模式替换），不引入新功能。

### 何时被选中

- 任务 scenario = `refactor`
- 任务 tags 包含 `refactor`
- 用户介入显式要求重构

### 何时跳过

- add-feature 任务（重构应包含在 `tdd-implementation` 的 REFACTOR 步骤中）
- bug-fix 任务（除非 bug 根因是结构性问题）

### 执行步骤

1. **基线测试**：跑全套测试，确认全绿；记录覆盖率。
2. **重构操作**：每次只做一种（提取函数 / 提取类 / 合并 / 重命名 / 模式替换）。
3. **每步回跑测试**：必须保持全绿；任何一步红就回退。
4. **覆盖率不下降**：与基线比对，覆盖率 < 基线则失败。
5. **写知识**：在 `<unit>/<feature>/architecture` 追加重构决策（why / before / after / 风险）。

### Quality Gates

| Layer | Gate | Pass 条件 |
|---|---|---|
| L1 | build / lint / unit-test | 同 tdd-implementation |
| L2 | test_pass / lint_pass | 同 tdd-implementation |
| 额外 | coverage_not_regressed | 覆盖率 >= 基线（pre-refactor） |

### 不做的事

- 不加新功能（如发现需要新功能 → 调 `opc_pipeline_replan` 插队加 sub-pipeline）
- 不改 API 契约（外部行为不变是重构定义）
- 不改数据库 schema（同上）
