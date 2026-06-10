# 09 MCP 工具

管线层 3 个工具（`opc_pipeline_create` / `opc_pipeline_status` / `opc_pipeline_lifecycle`）。
流程层 7 个 `opc_flow_*` 工具见 [../01-intent-analysis/02_flow-tools-entry-lifecycle.md](../01-intent-analysis/02_flow-tools-entry-lifecycle.md)。

> 历史名 `opc_pipeline_complete` / `opc_pipeline_abort` / `opc_pipeline_replan` / `opc_pipeline_resume` 已折叠为 `opc_pipeline_lifecycle({action})` 的 discriminator 分支；`opc_pipeline_recover` 已折叠为 `opc_flow_lifecycle({action:"recover"})`。详见 [../../07-tool-consolidation/00_overview.md](../../07-tool-consolidation/00_overview.md)。

---

## 工具总览

| # | 工具 | 说明 |
|---|------|------|
| 1 | `opc_pipeline_create` | 创建管线：`opc_flow_step_complete({step:"brief_generation"})` 路由触发，参数已预填；写入文件并返回 flow_next |
| 2 | `opc_pipeline_status` | 读取管线状态（支持子管线筛选） |
| 3 | `opc_pipeline_lifecycle` | 管线生命周期统一入口：`action ∈ {complete, abort, replan, resume}`；恢复孤儿管线请走 `opc_flow_lifecycle({action:"recover"})` |

---

## opc_pipeline_create

```
触发: opc_flow_step_complete({step:"brief_generation"}) 返回 next 字段预填全部参数

参数: description, tags, complexity, knowledge_unit,
      suggested_phases, phase_selection_rationale, scenario,
      brief_content, sub_pipelines[], execution_order[]

      sub_pipelines[].phase_selection_rationale 可选——若拆分时为每条子
      管线单独指定 phase 选择理由，则覆盖顶层 rationale（决定 selected_by
      = "task_decomposition"）。

行为:
  → 生成 pipeline ID，创建 .opc/pipelines/<id>/
  → 写入 pipeline-plan.json（含 sub_pipelines + execution_order + owner）
  → 写入 brief.md（内容由 Claude 提供）
  → 写入 state.json（每条子管线落盘 phase_plan 块）：
      · available = 扫描 phases/ 目录得出
      · selected = suggested_phases（或子管线自带 selected）
      · selected_by = "task_analysis"（拆分子管线为 "task_decomposition"）
      · selection_rationale = phase_selection_rationale
      · 跑 phase_plan 六 5 条校验，任一 fail 则整体回滚
  → 校验 blocked_by 引用的 sub_id 存在且无环
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

> phase_plan 校验失败时返回 `{ error: "phase_plan_invalid", failed_rules: [...], suggested_action: {tool: "opc_flow_correct", args: {action: "restart", from_step: "task_analysis"}} }`。详见 [04_state-json.md 六](04_state-json.md#六phase_plan-校验规则deterministic)。

---

## opc_pipeline_status

```
参数: pipeline_id, sub_pipeline_id? (可选)

带 sub_pipeline_id → state.json 完整内容 + node 状态 + unblocked_nodes
不带 → 各子管线状态聚合 + next_sub_pipeline + blocked_sub_pipelines
```

### 不带 sub_pipeline_id 的返回结构

```json
{
  "pipeline_id": "pipeline-20260608-001",
  "status": "in_progress",
  "sub_pipelines": [
    {"id": "sub-1", "status": "completed"},
    {"id": "sub-2", "status": "in_progress"},
    {"id": "sub-3", "status": "pending", "blocked_by": ["sub-1", "sub-2"]}
  ],
  "next_sub_pipeline": {
    "id": "sub-2",
    "reason": "execution_order 顺序第一位且 blocked_by 全部 completed",
    "next": {"tool": "opc_phase_start", "args": {"sub_pipeline_id": "sub-2"}}
  },
  "blocked_sub_pipelines": [
    {"id": "sub-3", "waiting_for": ["sub-2"]}
  ]
}
```

### next_sub_pipeline 计算规则

- 返回**当前唯一可执行**的子管线（不做条数限制）
- 进入条件：`status == pending` **且** `blocked_by` 全部 `completed` **且** 无 `blocked_by` 路径上的 `failed`
- 如有多条 pending sub 同时满足，取 `execution_order` 中顺序最靠前的一条
- 若无可执行的 sub → 返回 `null`

---

## opc_pipeline_lifecycle

统一的管线生命周期入口。请求体顶层必含 `action` 字段（discriminator），根据 action 路由到对应分支。

```
公共参数:
  action: "complete" | "abort" | "replan" | "resume"
  pipeline_id: string
  reason?: string

discriminator 分支:
  action="complete"  → 见 §complete
  action="abort"     → 见 §abort
  action="replan"    → 见 §replan
  action="resume"    → 见 §resume
```

> **恢复孤儿管线**（owner.pid 已死）**不在本工具内**：走 `opc_flow_lifecycle({action:"recover"})`，由流程层统一接管 owner、重置 flow-state，并在内部更新 pipeline-plan 的 owner 字段。本工具的 4 个 action 都假定 owner 已归当前 session。

---

### opc_pipeline_lifecycle action=complete

> ⚠️ **reflection-registry-guard 前置校验**：本分支受 registry-guard 保护。若 `flow-state.json.pending_reflections[]` 非空，则 reject 并返回 `required_action`。完整契约见 [../../05-opc-reflection-server/04-reflection-flow/06_call-sequence-contract.md](../../05-opc-reflection-server/04-reflection-flow/06_call-sequence-contract.md)。

```
参数: { action: "complete", pipeline_id }

行为:
  ⓪ registry-guard 前置校验 → pending_reflections 非空时 reject
  → 校验全部子管线状态 == completed
  → 汇总各子管线的 output 产物清单
  → 写入 .opc/pipelines/<id>/manifest.md
  → pipeline-plan.json status → completed
  → 释放 owner（knowledge 历史保留在 git，无需物理清理）
  → 同步通知 flow-state.json status → completed

返回:
{
  pipeline_id, manifest_path, completed_at,
  produced_units: [...],
  total_nodes: int, total_phases: int
}
```

---

### opc_pipeline_lifecycle action=abort

```
参数: { action: "abort", pipeline_id, kill_agents?: boolean (默认 true), reason? }

行为:
  → pipeline-plan.json status → aborted
  → 全部 in_progress sub_pipelines/phases/nodes 标记 aborted
  → kill_agents=true → 向所有 in_progress node 的 sub-agent 发 SIGTERM（pid 存于 node.agent_pid）
  → 写入 abort_reason
  → owner 释放（knowledge 历史保留在 git）
  → 若 flow-state.status=in_progress + pipeline_id 匹配 → 同步调用 opc_flow_lifecycle({action:"abort"})

返回:
{
  aborted_pipeline_id, killed_agent_pids: [...]
}
```

---

### opc_pipeline_lifecycle action=replan（细粒度）

```
参数: { action: "replan", pipeline_id, changes: {
  add_phase_node?: [{phase, node, blocked_by?}],     // 增加节点到指定阶段
  remove_phase_node?: [{phase, node}],               // 移除节点（仅 pending 状态可移除）
  replace_phase_node?: [{phase, old_node, new_node}],// 替换节点
  add_phase?: [{phase, after?: "..."}],              // 新增阶段插入位置
  remove_phase?: [phase],                            // 移除阶段（仅 pending 可移）
  update_complexity?: "low"|"medium"|"high",         // 修改复杂度（影响后续 phase 推进策略）
  update_phase_plan?: {                              // 重排或替换 selected（仅 pending 可重排）
    sub_pipeline_id: "sub-1",
    selected: [...],
    selection_rationale: "<必填，replan 必须给出理由>",
    selected_by: "replan"
  },
  add_sub_pipeline?: [{
    id, title, knowledge_unit, blocked_by,
    phase_plan: { selected, selection_rationale,
                  selected_by: "task_decomposition" | "user_insert" },
    execution_priority?: "normal" | "immediate",  // 默认 normal；immediate 触发插队
    insert_after?: "<sub_id>"                     // execution_priority=normal 时指定插入位置
  }],
  remove_sub_pipeline?: [id],                        // 仅 pending 可移
  update_execution_order?: [...]
}, reason?: string }

行为:
  ① 校验:
     · 已 completed 的 sub_pipelines/phases/nodes 不可删除/重排/替换
     · 已 in_progress 的 phase/node 不可修改其结构
     · 增加节点：tag 必须与该 phase 兼容；blocked_by 节点必须存在
     · 增加阶段：必须在该子管线 phase_plan.available 列表中
     · update_phase_plan: 重跑 phase_plan 六 5 条校验
       （存在性 + 偏序 + 非空 + 与 phases[] 一致 + rationale 必填），
       失败则该项 reject 并写入 rejected_changes
     · update_execution_order 必须保持 blocked_by 推导的偏序（前置 sub 在前）
     · add_sub_pipeline + execution_priority=immediate（插队场景）:
       - 当前必有一条 sub 处于 in_progress（否则降级为 normal 直接入队）
       - 新 sub 的 knowledge_unit 必须**不与**当前 in_progress sub 的 unit 重叠
         （避免插队 sub 与挂起 sub 写同一 knowledge 引发 base_version 冲突）
       - 仅在 **node 边界** 生效：当前 in_progress node 跑完（completed/failed）
         才执行挂起；不打断进行中的 sub-agent
  ② 应用 changes 到 pipeline-plan.json + state.json
     · update_phase_plan 通过校验后写入对应子管线 state.json 的 phase_plan
       块，order_validated: true
     · execution_priority=immediate:
       - 当前 in_progress sub → status: paused，记 paused_at: {at, node}
       - 新 sub 插入 execution_order group 0 最前位置（其他 group 整体后移）
       - 新 sub status → pending，inserted_at: <ts>
       - 标记 flow-state.json.active_sub_pipeline_id = 新 sub.id
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
  · 插队 sub（execution_priority=immediate）必须在 node 边界生效——
    新 sub 入 pending 但不立即跑；当前 in_progress sub 的 active node 完成后，
    state-manager 检测到 paused-pending 配对，自动把被插队 sub 标记 paused，
    才让 active 切换到新 sub。详见 [11_insert-resume.md](11_insert-resume.md)。
```

---

### opc_pipeline_lifecycle action=resume

```
触发: 插队 sub 跑完（status=completed/aborted/failed）后，由 opc_phase_complete 内部
      检测到 pipeline-plan.json 存在 status=paused 的 sub 时自动调用；
      或用户主动调用以恢复指定挂起 sub。

参数: { action: "resume", pipeline_id, sub_pipeline_id }

行为:
  ① 校验目标 sub:
     · status == paused → 通过
     · 其他状态 → reject，返回 {error: "not_paused", current_status}
  ② 校验当前无 in_progress sub（同一时刻仅一条活跃）:
     · 有 → reject，返回 {error: "another_sub_in_progress", active_sub_id}
  ③ 读 sub.paused_at = {at, node, phase}
  ④ 一致性探测（防止挂起期间用户改动 knowledge）:
     · 对该 sub 已 confirmed 的 phase 涉及的每个 output knowledge 路径:
       - git show <phase.confirm_commit_ref>:opc-knowledge/<path>  → confirmed 内容
       - 读当前 .md → current
       - 若 confirmed != current → 列入 dirty_paths（提示但不阻断；下次
         opc_knowledge_write 时 base_version 探测器会进入 3-way diff-and-merge）
  ⑤ sub.status → in_progress
  ⑥ 清除 paused_at（保留到 history.paused_events[]，供审计）
  ⑦ flow-state.json.active_sub_pipeline_id = sub_pipeline_id
  ⑧ flow-state.json.current_pipeline_pointer = {sub_id, phase, node}（恢复到挂起前）

返回:
{
  resumed_sub_pipeline_id,
  resumed_at: "...",
  paused_for_ms: 1234567,                          // 挂起时长（审计用）
  resume_pointer: {phase, node},                   // 续跑入口
  dirty_paths: [{path, hint: "下次写入将走 3-way diff-and-merge"}],
  flow_next: {tool: "opc_node_start", args: {node_name}}
}

约束:
  · 不修改 knowledge 文件（探测不会覆盖；冲突由后续 write 走 02_core-tools §2.10）
  · 不重启已结束的 sub-agent（resume 是状态切换，不是工具重跑）
  · 插队 sub 全部完成才会触发 resume；中途再次插队也会按 paused 栈式压入
```

---

## 相关文档

- [../01-intent-analysis/02_flow-tools-entry-lifecycle.md](../01-intent-analysis/02_flow-tools-entry-lifecycle.md) — 7 个流程层工具
- [06_lifecycle.md](06_lifecycle.md) — 工具在生命周期中的调用顺序
- [10_complete-example.md](10_complete-example.md) — 完整调用链路
- [11_insert-resume.md](11_insert-resume.md) — 插队/挂起/恢复完整契约
- [../../07-tool-consolidation/00_overview.md](../../07-tool-consolidation/00_overview.md) — 54→24 工具合并方案
