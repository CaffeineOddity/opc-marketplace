---
name: backend-endpoint
tags: [backend, database]
description: 实现普通后端 API 端点（CRUD / 查询 / 业务逻辑）
agents:
  primary: [backend-engineer]
  fallback: [fullstack-engineer]
input:
  - path: <unit>/<feature>/api
    type: knowledge
  - path: <unit>/<feature>/model
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

## 后端端点实现节点

通用 RESTful / GraphQL / RPC 端点实现节点。**非认证类**端点的默认选择。

### 何时被选中

- 任务 tags 包含 `backend` 或 `database`
- 任务非认证主导（`auth` tag 不为主调）；否则 `auth-integration` 优先

### 何时被反思淘汰

典型场景：任务包含 `auth` tag 时，`auth-integration` 与 `backend-endpoint` 同时被推荐 → P5 V5 触发 `file_domain_conflicts: [{between: ["auth-integration", "backend-endpoint"], reason: "src/auth/ 路径重叠"}]` → M4 Critique 建议移除 `backend-endpoint`（认证已涵盖端点实现）。

> 本节点设计上**期待**被认证场景反思移除——这是 P5 反思循环的标准案例（见 e2e walkthrough 5.2）。

### 执行步骤（被选中时）

与 `tdd-implementation` 几乎相同，但聚焦于"业务 CRUD" 而非测试驱动：

1. 加载 API + model 契约
2. 实现 controller / service / repository 三层
3. 写测试覆盖 happy path + 关键边界
4. lint + typecheck pass

### Quality Gates 同 tdd-implementation

### 不做的事

- 不实现认证逻辑（归 `auth-integration`）
- 不修改 API 契约
- 不做安全审查
