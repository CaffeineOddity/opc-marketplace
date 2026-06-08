# 05 opc_phase_confirm 与节点执行

阶段锁定执行计划。`opc_phase_confirm` 由 node-resolver 解析依赖、检查文件域冲突、生成执行分组，并创建快照。

---

## 一、opc_phase_confirm — 锁定执行计划

```
参数: pipeline_id, sub_pipeline_id, phase, nodes: [{name, blocked_by?}]

行为:
  → node-resolver 解析依赖（即使用户传了 blocked_by 也校验 + 修正）
  → 文件域冲突检查（artifacts + knowledge 路径重叠 → 降级串行）
  → 写入 state.json phases[].nodes[] + blocked_by
  → 快照当前 phase 节点的 output.knowledge 路径 → .opc/snapshots/
  → 锁定后不可再 opc_phase_adjust
  → 更新 flow-state.json:
      · current_step = "phase_confirmed"
      · current_pipeline_pointer = { sub_pipeline_id, phase, node: null }
      · last_heartbeat_at 刷新

返回: {
  groups: [{group: 1, nodes: [...], parallel: true}, ...],
  flow_next: {
    tool: "opc_node_start",
    args: {pipeline_id, sub_pipeline_id, node_name: <第一组首个节点>},
    why: "按 group 顺序依次启动 node；同组 parallel:true 的节点可并行 opc_node_start"
  }
}
```

---

## 二、执行节点

逐组执行，每个 node 走完整流程（详见 [../04_node-overview.md](../04_node-overview.md)）：

```
opc_node_start → Agent 加载知识 → 执行 → opc_node_complete / opc_node_fail
```

执行规则：
- 组内 `parallel: true` 节点可并行 `opc_node_start`
- 跨组严格串行（前一组全部 completed 才能启动下一组）
- 任一节点 `failed` 阻塞同组下游节点
- 节点 retry / 超时由 state-manager 惰性检测，详见 [../node/05_execution-and-retry.md](../node/05_execution-and-retry.md)

---

## 相关文档

- [04_phase-start.md](04_phase-start.md) — `opc_phase_start` + 自省评估
- [06_phase-complete-reset.md](06_phase-complete-reset.md) — `opc_phase_complete` + `opc_phase_reset`
- [../04_node-overview.md](../04_node-overview.md) — 节点定义与执行
- [../node/04_concurrency-and-deps.md](../node/04_concurrency-and-deps.md) — 文件域冲突检测细节
