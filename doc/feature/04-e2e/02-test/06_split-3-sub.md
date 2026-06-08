# 06 拆分管线（3 条子管线）

> 本文档是 [test 总览](00_overview.md) 的子文档。其他子文档：
> [闲聊](01_chat.md) · [项目知识问答](02_project-question.md) · [low 快速通道](03_low-complexity.md) · [medium 单管线](04_medium-single.md) · [high 单管线](05_high-single.md) · [5 子管线](07_split-5-sub.md) · [管线恢复](08_recovery.md) · [阶段重置](09_phase-reset.md) · [取消管线](10_abort.md)

---

**输入**："实现商品管理 + 购物车功能"

```
Claude → opc_flow_query → opc_flow_start → opc_intent_complete → opc_knowledge_list
Claude 分析: knowledge_unit: [product, cart] → modify_unit_count=2
Claude → opc_task_analysis_complete
  → opc_task_analysis_complete 路由 task_decomposition

Claude 拆分:
  → cart._refs: [product]
  → sub-1: product（无依赖）
  → sub-2: cart（blocked_by: [sub-1]）
  → execution_order: Group1[sub-1] → Group2[sub-2]
  → 自省: decomp_confidence: 0.87

Claude → opc_decomposition_complete({...})
  → opc_decomposition_complete 判定: 0.87 ≥ 0.8 → 自动推进 → 路由 brief_generation
  → Claude 通知: "已自动拆分为 2 条子管线（置信度 0.87）"

Claude → opc_brief_complete → opc_pipeline_create({...sub_pipelines...})
  → state-server 写入 pipeline-plan.json
  → 返回 flow_next: opc_knowledge_open

Claude → opc_knowledge_open → flow_next: opc_phase_start (sub-1)

[sub-1 各 phase 跑完]

opc_phase_complete(sub-1, 最后 phase) → {
  next_phase: null,
  pipeline_progress: {
    current_sub: "sub-1", current_sub_status: "completed",
    ready_sub_pipelines: ["sub-2"]
  },
  flow_next: { tool: "opc_phase_start", args: {sub_pipeline_id: "sub-2", phase: "04-implement-design"} }
}

Claude 按 flow_next 启动 sub-2 → ... → opc_pipeline_complete
```

**关键改进**：`opc_phase_complete` 返回 `pipeline_progress.ready_sub_pipelines` + `flow_next`，Claude 不需要猜下一步该启动哪条子管线。

**结论**：✓ 无缺口。

---

## 相关文档

- [07_split-5-sub.md](07_split-5-sub.md) — 下一场景：5 条子管线
- [../../02-opc-state-server/02-pipeline/05_single-vs-split.md](../../02-opc-state-server/02-pipeline/05_single-vs-split.md) — 拆分依据
