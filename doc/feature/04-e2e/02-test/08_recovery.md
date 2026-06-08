# 08 管线恢复

> 本文档是 [test 总览](00_overview.md) 的子文档。其他子文档：
> [闲聊](01_chat.md) · [项目知识问答](02_project-question.md) · [low 快速通道](03_low-complexity.md) · [medium 单管线](04_medium-single.md) · [high 单管线](05_high-single.md) · [3 子管线](06_split-3-sub.md) · [5 子管线](07_split-5-sub.md) · [阶段重置](09_phase-reset.md) · [取消管线](10_abort.md)

---

**输入**：（断电重连，上次在 05-implement/tdd-implementation 中间）

```
Session 启动后用户首次发消息（任意内容）
UserPromptSubmit hook → 注入"先调 opc_flow_query"
Claude → opc_flow_query()
  → 读 .opc/sessions/<id>/flow-state.json → status: in_progress, owner.pid=12345
  → 检查 pid 存活 → 已死（孤儿）
  → 返回:
    {
      active: true,
      orphan: true,
      owner: {pid: 12345, alive: false},
      snapshot: {
        current_step: "phase_execution",
        pipeline_id: "pipeline-001",
        current_pipeline_pointer: {sub_pipeline_id: "sub-1", phase: "05-implement", node: "tdd-implementation"}
      },
      suggested_actions: [
        {intent: "恢复流程", next: {tool: "opc_flow_recover"}},
        {intent: "放弃并开新流程", next: {tools: ["opc_flow_abort", "opc_flow_start"]}}
      ],
      orphan_pipelines: [{id: "pipeline-001", last_active: "...", suggest: "opc_pipeline_recover"}]
    }

用户: "恢复"

Claude → opc_flow_recover()
  → owner.pid 接管为当前 pid
  → 检测 current_pipeline_pointer 非空 → 内部调 opc_pipeline_recover(pipeline-001)
    · in_progress node tdd-implementation 超时（>30 min 无心跳）→ 自动标记 failed (error.type: timeout)
  → 返回:
    {
      recovered: true,
      resume_step: "phase_execution",
      resume_pointer: {sub_pipeline_id: "sub-1", phase: "05-implement", node: "tdd-implementation"},
      next: {tool: "opc_node_retry", args: {node_name: "tdd-implementation"}},
      recoverable_nodes: [{name: "tdd-implementation", status: "failed", suggested_action: "opc_node_retry"}]
    }

Claude → opc_node_retry("tdd-implementation") → 级联重置下游 → 重跑
```

**关键改进**：opc_flow_recover `opc_flow_recover` 自动 timeout 检测，避免脏 in_progress 状态卡死。无需独立 SessionStart hook。

**结论**：✓ 无缺口。

---

## 相关文档

- [09_phase-reset.md](09_phase-reset.md) — 下一场景：阶段重置
- [../../02-opc-state-server/01-intent-analysis/02_flow-tools-entry-lifecycle.md](../../02-opc-state-server/01-intent-analysis/02_flow-tools-entry-lifecycle.md) — 恢复与孤儿（opc_flow_recover）
