# 10 取消管线

> 本文档是 [test 总览](00_overview.md) 的子文档。其他子文档：
> [闲聊](01_chat.md) · [项目知识问答](02_project-question.md) · [low 快速通道](03_low-complexity.md) · [medium 单管线](04_medium-single.md) · [high 单管线](05_high-single.md) · [3 子管线](06_split-3-sub.md) · [5 子管线](07_split-5-sub.md) · [管线恢复](08_recovery.md) · [阶段重置](09_phase-reset.md)

---

**输入**："不做了，取消"

> 工具名约定：本文档统一使用 [07-tool-consolidation](../../07-tool-consolidation/00_overview.md) 合并后的新工具名。`opc_flow_abort` 已合并到 `opc_flow_lifecycle({action:"abort"})`；`opc_pipeline_abort` 已合并到 `opc_pipeline_lifecycle({action:"abort"})`。

```
Claude → opc_flow_query → 返回 active: true + 9 种 suggested_actions
Claude 判断: 用户要彻底放弃 → 选 "彻底放弃换任务"
Claude → opc_flow_lifecycle({action:"abort", reason: "user_cancel"})
  → 行为:
    · flow-state.status → aborted + aborted_at + reason
    · pipeline_id 已创建 → 自动级联 opc_pipeline_lifecycle({action:"abort", kill_agents: true})
      · pipeline-plan.json: status → aborted
      · 所有 in_progress sub_pipelines/phases/nodes 标记 aborted
      · kill in_progress sub-agent 进程
      · 清理 .opc/snapshots/
    · 释放 owner (pid 清零)
  → 返回 { aborted: true, freed_pipeline_id: "pipeline-001", killed_agent_pids: [...] }

下次用户消息:
  hook 注入"先调 opc_flow_query"
  Claude → opc_flow_query → status=aborted → 返回 active: false + suggested_actions（含 opc_flow_lifecycle({action:"start"})）
  （aborted 状态不会被误判为活跃流程）
```

**关键改进**：`opc_flow_lifecycle({action:"abort"})` 自动级联管线 abort + kill sub-agent，无需 Claude 分两步调。

**结论**：✓ 链路完整。

---

## 相关文档

- [00_overview.md](00_overview.md) — 总览（含汇总表）
