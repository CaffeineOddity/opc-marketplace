# 09 MCP 工具

管线层 6 个工具。流程层 13 个 `opc_flow_*` 工具见 [../intent-analysis/02_flow-tools-entry-lifecycle.md](../intent-analysis/02_flow-tools-entry-lifecycle.md)。

---

## 工具总览

| # | 工具 | 说明 |
|---|------|------|
| 1 | `opc_pipeline_create` | 创建管线：`opc_brief_complete` 路由触发，参数已预填；写入文件并返回 flow_next |
| 2 | `opc_pipeline_status` | 读取管线状态（支持子管线筛选） |
| 3 | `opc_pipeline_recover` | 手动恢复指定孤儿管线（通常由 `opc_flow_recover` 内部调用） |
| 4 | `opc_pipeline_complete` | 管线完成：校验 + `manifest.md` |
| 5 | `opc_pipeline_abort` | 管线取消：级联终止 + kill in_progress sub-agent + 同步调用 `opc_flow_abort` |
| 6 | `opc_pipeline_replan` | 管线修改：细粒度增删节点、阶段，调整子管线列表和执行顺序 |

---

## opc_pipeline_create

```
触发: opc_brief_complete 返回 next 字段预填全部参数

参数: description, tags, complexity, knowledge_unit, suggested_phases, scenario,
      brief_content, sub_pipelines[], execution_order[]

行为:
  → 生成 pipeline ID，创建 .opc/pipelines/<id>/
  → 写入 pipeline-plan.json（含 sub_pipelines + execution_order + owner）
  → 写入 brief.md（内容由 Claude 提供）
  → 写入 state.json（初始空 phases）
  → 校验 execution_order 与 blocked_by 的拓扑一致性
  → 更新 .opc/sessions/<id>/flow-state.json：
      · pipeline_id = <新 ID>
      · current_step = "pipeline_created"

返回:
{
  pipeline_id: "pipeline-xxx",
  created_at: "...",
  flow_next: {
    tool: "opc_knowledge_open",
    args: { units: [...聚合所有 sub_pipelines.knowledge_unit] },
    why: "管线已创建，下一步初始化知识单元"
  }
}
```

---

## opc_pipeline_status

```
参数: pipeline_id, sub_pipeline_id? (可选)

带 sub_pipeline_id → state.json 完整内容 + node 状态 + unblocked_nodes
不带 → 各子管线状态聚合 + ready_sub_pipelines（blocked_by 全满足且非 failed downstream）
```

---

## opc_pipeline_recover

```
参数: pipeline_id

行为:
  → 检查 owner.pid 是否存活
    ├── 存活 → 拒绝
    └── 已死 → 更新 owner 为当前 session
  → 检查 in_progress node 超时（默认 30 分钟无心跳）→ 自动标记 failed (error.type: timeout)
  → 返回可恢复的 in_progress + failed node 列表
  → 同时更新 flow-state.json：标记 step: pipeline_recovered

返回:
{
  pipeline_id, owner_taken,
  recoverable_nodes: [{name, status, suggested_action: "opc_node_retry"|"opc_node_start"}]
}
```

---

## opc_pipeline_complete

```
参数: pipeline_id

行为:
  → 校验全部子管线状态 == completed
  → 汇总各子管线的 output 产物清单
  → 写入 .opc/pipelines/<id>/manifest.md
  → pipeline-plan.json status → completed
  → 释放 owner，清理 snapshots/
  → 同步通知 flow-state.json status → completed

返回:
{
  pipeline_id, manifest_path, completed_at,
  produced_units: [...],
  total_nodes: int, total_phases: int
}
```

---

## opc_pipeline_abort

```
参数: pipeline_id, kill_agents?: boolean (默认 true), reason?

行为:
  → pipeline-plan.json status → aborted
  → 全部 in_progress sub_pipelines/phases/nodes 标记 aborted
  → kill_agents=true → 向所有 in_progress node 的 sub-agent 发 SIGTERM（pid 存于 node.agent_pid）
  → 写入 abort_reason
  → 清理 .opc/snapshots/
  → 若 flow-state.status=in_progress + pipeline_id 匹配 → 同步调用 opc_flow_abort

返回:
{
  aborted_pipeline_id, killed_agent_pids: [...], freed_snapshots: int
}
```

---

## opc_pipeline_replan（细粒度）

```
参数: pipeline_id, changes: {
  add_phase_node?: [{phase, node, blocked_by?}],     // 增加节点到指定阶段
  remove_phase_node?: [{phase, node}],               // 移除节点（仅 pending 状态可移除）
  replace_phase_node?: [{phase, old_node, new_node}],// 替换节点
  add_phase?: [{phase, after?: "..."}],              // 新增阶段插入位置
  remove_phase?: [phase],                            // 移除阶段（仅 pending 可移）
  update_complexity?: "low"|"medium"|"high",         // 修改复杂度（影响后续 phase 推进策略）
  update_suggested_phases?: [...],                   // 重排阶段顺序（仅 pending 可重排）
  add_sub_pipeline?: [{id, title, knowledge_unit, blocked_by}],
  remove_sub_pipeline?: [id],                        // 仅 pending 可移
  update_execution_order?: [...]
}, reason?: string

行为:
  ① 校验:
     · 已 completed 的 sub_pipelines/phases/nodes 不可删除/重排/替换
     · 已 in_progress 的 phase/node 不可修改其结构
     · 增加节点：tag 必须与该 phase 兼容；blocked_by 节点必须存在
     · 增加阶段：必须在 suggested_phases 已知列表中
     · update_execution_order 必须与 blocked_by 拓扑一致
  ② 应用 changes 到 pipeline-plan.json + state.json
  ③ 重新触发 node-resolver 校验依赖关系
  ④ 追加 replan_history[] 到 pipeline-plan.json
  ⑤ 更新 flow-state.json.history

返回:
{
  pipeline_id,
  applied_changes: {...},
  rejected_changes: [{change, reason}],
  updated_phases: ["..."],
  updated_sub_pipelines: ["..."],
  replan_history_id: "replan-001"
}

约束:
  · 当前正在执行的 node 不受影响（继续按原计划跑完）
  · 受影响的下游 pending 节点立即根据新计划生效
  · complexity 升级 (medium→high) 会自动把后续 phase 的 auto_advance 改为 false
```

---

## 相关文档

- [../intent-analysis/02_flow-tools-entry-lifecycle.md](../intent-analysis/02_flow-tools-entry-lifecycle.md) — 13 个流程层工具
- [06_lifecycle.md](06_lifecycle.md) — 工具在生命周期中的调用顺序
- [10_complete-example.md](10_complete-example.md) — 完整调用链路
