# MCP 服务

OPC 提供两个独立的 MCP 服务，替代传统的 hook 体系。所有自动化行为由 MCP 工具在内部处理，不需要 Claude Code hook。

## 两个 MCP 服务

| 服务 | 职责 |
|------|------|
| opc-state-server | 任务跟进：管线状态、阶段推进、节点执行、依赖解锁 |
| opc-knowledge-server | 知识库：知识 CRUD、版本管理、全文搜索 |

## 原 Hook → MCP 工具对照

| 原 Hook | 新机制 |
|---------|--------|
| knowledge-load | Agent 调用 `opc_knowledge_get` 加载前置知识 |
| knowledge-save | Agent 调用 `opc_knowledge_write` 写入知识 |
| phase-transition | `opc_phase_complete` 内部处理：高置信度自动推进，否则提示用户 |
| node-completion | `opc_node_complete` 内部处理：自动解锁 blocked_by 节点 |
| capability-scan | `opc_phase_start` 内部扫描内置 + 项目 node |
| tdd-gate | `opc_node_complete` L2 校验 `test_pass`，state-server 强制执行 |
| verification-gate | `opc_node_complete` L1 校验产出物存在性 + L2 校验 quality_gates |

## 自动机制

以下行为由 MCP 工具内部自动处理，调用方无需感知：

### 依赖解锁

`opc_node_complete` 完成后，自动检查 phase 内所有 pending node，将 `blocked_by` 已满足的节点标记为可执行。

### 阶段自动推进

`opc_phase_complete` 完成后：

- 检查下一 phase 是否在高置信度列表（`scenario_hints` 命中 + 语义相似度 > 0.9）
- 高置信度 → 自动调用 `opc_phase_start` 进入下一 phase
- 需确认 → 提示用户确认后推进

### 节点超时自动重试

`opc_pipeline_status`、`opc_phase_start`、`opc_node_start` 等工具调用时，内部检测 in_progress node 是否超时。超时且 `retry_count < max_retries` 时自动 `opc_node_retry`（含级联重置）。超限则标记 failed。

> **注意**：超时检测是惰性的——MCP server 无后台线程，Agent 占着 turn 期间无法检测。用户 Ctrl+C 后首次调 MCP 工具时触发。

### 管线恢复

opc-state-server 在 SessionStart 时扫描 `.opc/pipelines/`，发现 `in_progress` 的管线则提示用户恢复。

## 节点驱动取代 Hook

原有的 hook 目录（`hooks/`）已移除。管线每一步由对应节点驱动：

| 原 Hook 触发点 | 对应节点 |
|---------------|---------|
| 意图识别 | `intent-analysis` |
| 任务分析 | `task-analysis` |
| 知识加载/写入 | `knowledge-operation` |
| 阶段推进 | `phase-execution` |
| TDD gate | 任务节点指令中声明（Agent 自约束） |
| verification gate | 任务节点指令中声明（Agent 自约束） |

详见 [13 节点系统](13-guides.md)。
