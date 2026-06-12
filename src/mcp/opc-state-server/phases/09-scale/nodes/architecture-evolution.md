---
name: architecture-evolution
tags: [backend, refactor]
description: 架构演进方案（拆分 / 缓存 / 异步 / CQRS / 读写分离）
agents:
  primary: [backend-architect]
  fallback: [microservices-architect, cloud-architect]
input:
  - path: <unit>/<feature>/performance-profiling
    type: knowledge
  - path: <unit>/<feature>/architecture
    type: knowledge
output:
  - path: <unit>/<feature>/architecture
    type: knowledge
quality_gates:
  L1: []
  L2: [bottleneck_addressed, migration_cost_estimated, rollback_path_defined]
always_show: false
---

## 架构演进节点

基于 performance-profiling 的瓶颈清单设计架构演进方案，含迁移成本与回退路径。

### 何时被选中

- performance-profiling 已识别架构层瓶颈（service 拆分 / 数据库瓶颈 / 同步调用过深）
- 任务 tags 包含 `refactor` + `optimize` + 规模化语境

### 何时跳过

- 瓶颈为代码层（直接 05-implement 的 refactor 即可解决）
- 瓶颈为容量（归 capacity-planning）

### 执行步骤

1. **加载 profiling**：明确要解决哪些 USE 维度的瓶颈。
2. **方案候选**：列 2-3 个备选（如缓存 vs 读写分离 vs 分库），各列优缺点。
3. **迁移成本**：人力 / 工期 / 业务停机时长 / 数据迁移风险。
4. **回退路径**：每个方案必须可逆；不可逆方案需有 forward-fix 兜底。
5. **决策**：通常引入 ADR（Architecture Decision Record）格式持久化。
6. **写知识**：在既有 `<unit>/<feature>/architecture` 上 base_version + 3-way merge → v+1（参考记忆 [[project_knowledge_write_conflict]]）。

### Quality Gates

| Layer | Gate | Pass 条件 |
|---|---|---|
| L2 | bottleneck_addressed | 方案明确对应 profiling 中的某条瓶颈 |
| L2 | migration_cost_estimated | 人力 + 工期 + 停机时长齐备 |
| L2 | rollback_path_defined | 含可逆操作或 forward-fix 方案 |

### 接破坏性变更回流

- 若方案涉及破坏性 API 变更 → 触发 `opc_phase_reset` 回到 04-implement-design L2，**不**在本节点直接改 API 契约。

### 不做的事

- 不实现代码（决策 → 新建 sub-pipeline 回 05-implement）
- 不做容量计算（归 capacity-planning）
- 不做生产部署（归 07-release）
