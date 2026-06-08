# 06 opc_phase_complete、opc_phase_reset 与分层回退

阶段完成与回退。完成时自动计算推进策略；reset 通过快照恢复 knowledge，下游级联 pending。

---

## 一、opc_phase_complete — 阶段完成

```
参数: pipeline_id, sub_pipeline_id, phase

行为:
  → 校验该 phase 全部 node completed
  → 写入 state.json phases[].status = completed
  → 计算下一 phase + 是否 auto_advance
  → 计算 pipeline_progress（含 ready_sub_pipelines、failed downstream 等）
  → 更新 flow-state.json:
      · 若 next_phase 存在 + auto_advance → current_pipeline_pointer = { sub_pipeline_id, phase: next_phase, node: null }
      · 若 next_phase 为 null + ready_sub_pipelines 非空 → current_pipeline_pointer = { sub_pipeline_id: ready_sub_pipelines[0], phase: null, node: null }
      · 若全部完成 → current_pipeline_pointer 保留为最后位置，等待 opc_pipeline_complete
      · last_heartbeat_at 刷新

返回:
{
  phase: "04-implement-design",
  status: "completed",
  next_phase: "05-implement",
  auto_advance: true,
  next_phase_message: "进入 05-implement 编码阶段",
  pipeline_progress: {
    current_sub: "sub-1",
    current_sub_status: "in_progress",
    ready_sub_pipelines: [],          ← blocked_by 全满足且非 failed downstream 的子管线
    pending_sub_pipelines: ["sub-3"]
  },
  flow_next: {
    tool: "opc_phase_start",
    args: {pipeline_id, sub_pipeline_id, phase: "05-implement"},
    why: "auto_advance=true → 直接进入下一 phase"
  }
}
```

调用方根据 `auto_advance` + `pipeline_progress` 决定下一步：
- `next_phase != null` 且 `auto_advance: true` → 直接调 `opc_phase_start` 推进当前子管线
- `next_phase != null` 且 `auto_advance: false` → 提示用户确认后推进
- `next_phase == null` 且 `ready_sub_pipelines` 非空 → 启动下一条子管线
- `next_phase == null` 且 `ready_sub_pipelines` 为空 + 全部 sub completed → 调 `opc_pipeline_complete`

---

## 二、auto_advance 计算规则

```
auto_advance = (
    task.complexity != "high"
    AND 当前 phase 所有 node 100% completed（无 retry 兜底完成）
    AND 当前 phase 的 selection_confidence ≥ min_confidence_for_auto × 0.9
    AND 下一 phase 在 suggested_phases 中
)
```

任一条件不满足即 `auto_advance: false`，由用户确认。

---

## 三、opc_phase_reset — 阶段重置

```
参数: pipeline_id, sub_pipeline_id, phase

行为:
  → 检查 .opc/snapshots/ 有无快照
    ├── 有 → 复制快照回 opc-knowledge/ 对应路径
    └── 无 → 报错
  → 该 phase → pending（node 全部重置）
  → 下游 phase → pending
  → reset 完成后立即对当前 phase 重新生成快照（覆盖旧快照），保证幂等可重复 reset

限制:
  - 仅恢复 opc-knowledge/ 下的 .md 文件，不碰 src/
  - 管线 aborted 后不可 reset（快照已清理）
```

---

## 四、分层回退策略

| 层 | 场景 | 工具 |
|----|------|------|
| L0 | 调整节点选择 | `opc_phase_adjust` |
| L1 | 重做单个产出 | `opc_node_retry`（级联重置下游） |
| L2 | 废弃整个 phase 知识 | `opc_phase_reset`（快照恢复） |
| L3 | 全量回退（知识+代码） | git checkout/revert（OPC 不封装） |

L0–L2 是 OPC 内建的回退能力；L3 完全交给 git。

---

## 相关文档

- [05_phase-confirm-execute.md](05_phase-confirm-execute.md) — confirm 时生成快照
- [08_tools-and-automation.md](08_tools-and-automation.md) — 自动机制完整列表
- [../04-node/05_execution-and-retry.md](../04-node/05_execution-and-retry.md) — L1 `opc_node_retry`
