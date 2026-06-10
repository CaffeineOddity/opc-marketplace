# 05 节点执行与重试

完整执行流程：从 `opc_node_start` 到 `opc_node_finish({status})`，覆盖三种重试场景。

> **工具合并**：`opc_node_complete` / `opc_node_fail` / `opc_node_retry` 已折叠为 `opc_node_finish` 的 discriminator 分支，`status ∈ {success, failed, retry}`。详见 [../../07-tool-consolidation/00_overview.md](../../07-tool-consolidation/00_overview.md)。

---

## 一、执行流程

```
opc_node_start(pipeline_id, sub_id, node_name)
  → 检查 blocked_by 是否全部 completed
  → 扫描已安装 kit → 校验 primary Agent 可用性
  → 解析 node 路径（项目覆盖优先）→ 读取 body 注入返回
  → 写入 input + status: in_progress + agent + started_at
  → 返回 input 知识列表 + node_file_path + node_body + dispatch_instruction

Claude (主进程) 收到 dispatch_instruction 后:
  → 按方案 A：Task 工具 spawn sub-agent（subagent_type=agents.primary[0]）
    传入 node_body + 已加载的 input_knowledge
  → sub-agent 在隔离 context 执行:
    → 按 node body 指令逐步执行（如 TDD: RED → GREEN → REFACTOR）
    → 产出知识时调用 opc_knowledge_write
    → 产出代码时直接写入 src/、tests/ 等目录
    → 执行完毕后回报 evidence
  → 主进程据 evidence 调 opc_node_finish({status:"completed", evidence})

opc_node_finish({status:"completed", pipeline_id, sub_id, node_name, evidence})
  → L1: 检查 output.knowledge 和 output.artifacts 存在
  → L2: 检查 quality_gates（如有声明）
  → 写入 output + evidence + status: completed
  → 严格扫描 pending 节点：仅当某节点 blocked_by 全部 completed 才纳入 unblocked_nodes
  → 返回 { unblocked_nodes, flow_next }

opc_node_finish({status:"failed", pipeline_id, sub_id, node_name, error})
  → retry_count += 1
  → retry_count < max_retries → auto retry（不级联）
  → retry_count ≥ max_retries → failed

opc_node_finish({status:"retry", pipeline_id, sub_id, node_name, reset_retry_count?: boolean})
  → 手动重跑 completed/failed node
  → 计算影响面 → 自动级联重置下游
  → reset_retry_count 默认 true（用户手动 retry 视为新一轮）；超时自动 retry 不重置
```

---

## 二、三种重试的区别

| 场景 | 触发 | 是否级联 |
|------|------|---------|
| Agent 执行出错 | `opc_node_finish({status:"failed"})` → auto retry | 否（未产出新版本知识） |
| 节点超时 | `check_node_timeout` → `opc_node_finish({status:"retry"})` | 是 |
| 手动重跑 | `opc_node_finish({status:"retry"})` | 是 |

**为什么 Agent 出错不级联？** 因为 retry 时 input 不变、未产出新版本知识，下游依赖未受影响。

**为什么超时和手动重跑级联？** 因为可能已部分产出，下游已经基于旧版本运行，必须全部重置。

---

## 三、retry_count 计数规则

- `opc_node_finish({status:"failed"})` 自动 retry：`retry_count++`
- `opc_node_finish({status:"retry"})` 手动调用：`reset_retry_count=true` 默认清零
- 超时触发的自动 `opc_node_finish({status:"retry"})`：`reset_retry_count=false` 保留计数

达到 `max_retries`（默认 3）后 node 标记 `failed`，需要人工 `opc_node_finish({status:"retry", reset_retry_count:true})` 才能继续尝试。

---

## 相关文档

- [02_field-spec.md](02_field-spec.md) — `timeout_minutes` / `max_retries` / `quality_gates` 字段
- [07_tools.md](07_tools.md) — 2 个工具完整规范
- [08_internal-engines.md](08_internal-engines.md) — state-manager 重试与级联引擎
