# 08 自动机制与内部引擎

state-server 内部的纯 TypeScript 引擎，**全部零 LLM 依赖**。

---

## 一、自动机制

### 1.1 依赖解锁

`opc_node_complete` 后自动检查 phase 内所有 pending node，将 blocked_by 已满足的标记为可执行。严格语义：必须 blocked_by 全部 completed，部分 completed 不算。

### 1.2 节点超时自动重试

`opc_pipeline_status`、`opc_phase_start`、`opc_node_start` 调用时惰性检测 in_progress node 是否超时。超时且未达重试上限时自动 `opc_node_retry`（含级联重置）。

---

## 二、内部引擎

### 2.1 node-resolver（state-server 内部）

对选中节点做依赖解析和拓扑排序，输出分组执行计划。同时检查并行组冲突。纯 TypeScript 确定性逻辑。

- `resolve(phase, nodes)`: `opc_phase_confirm` 时解析依赖 + 冲突检测 + 拓扑排序
- `adjust(phase, nodes)`: `opc_phase_adjust` 时重新生成预览（不锁定）
- 输入: 选中节点列表（来自 Claude）
- 输出: `[{ group: 1, nodes: [...], parallel: true }, { group: 2, nodes: [...], parallel: false }]`

### 2.2 state-manager（state-server 内部，节点部分）

- `validate_node_completion()` — L1（产出物存在性）+ L2（quality_gates）校验
- `cascade_reset_after_retry()` — 计算下游影响面，自动重置受影响 node/phase
- `check_node_timeout()` — 惰性检测 in_progress node 超时
- `auto_retry_on_timeout()` — 超时后自动触发 `opc_node_retry`（含级联重置）
- `compute_unblocked_nodes()` — 严格语义：blocked_by 全部 completed 才纳入
- `compute_ready_sub_pipelines()` — 聚合规则：blocked_by 全 completed 且 upstream 无 failed

### 2.3 flow-router（state-server 内部，新增）

- `route(step, payload)` — 按 step + confidence + intent 决定下一步指令
- `persist_step(step, input, output)` — 写入 `.opc/sessions/<id>/flow-state.json`
- `persist_reflection(step_id, round, scores, notes)` — 反思日志追加
- `resume(session_id)` — 读取 `flow-state.json` 返回断点续传指令
- 纯 TypeScript 路由表，无 LLM

> 注意：原 `task-analyzer` 引擎已移除。意图识别、任务分析、语义匹配等 LLM 工作由 Claude Code 承担，通过 `prompts/*.md`（被 flow-router 工具返回引用，按需 Read）驱动。

---

## 相关文档

- [04_concurrency-and-deps.md](04_concurrency-and-deps.md) — node-resolver 的对外行为
- [05_execution-and-retry.md](05_execution-and-retry.md) — state-manager 重试逻辑
- [../01-intent-analysis/02_flow-tools-entry-lifecycle.md](../01-intent-analysis/02_flow-tools-entry-lifecycle.md) — flow-router 对外暴露的 13 个工具
