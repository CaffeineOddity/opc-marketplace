# 06 拆分管线（3 条子管线）

> 本文档是 [test 总览](00_overview.md) 的子文档。其他子文档：
> [闲聊](01_chat.md) · [项目知识问答](02_project-question.md) · [low 快速通道](03_low-complexity.md) · [medium 单管线](04_medium-single.md) · [high 单管线](05_high-single.md) · [5 子管线](07_split-5-sub.md) · [管线恢复](08_recovery.md) · [阶段重置](09_phase-reset.md) · [取消管线](10_abort.md)

---

**输入**："实现商品管理 + 购物车功能"

> 工具名约定：本文档统一使用 [07-tool-consolidation](../../07-tool-consolidation/00_overview.md) 合并后的新工具名。

```
Claude → opc_flow_query → opc_flow_lifecycle({action:"start"}) → opc_flow_step_complete({step:"intent_analysis", ...}) → opc_knowledge_read({mode:"list"})
Claude 分析: knowledge_unit: [product, cart] → modify_unit_count=2
Claude → opc_flow_step_complete({step:"task_analysis", analysis_result, task_analysis_evidence})
  → 路由 task_decomposition

Claude 拆分:
  → cart._refs: [product]
  → sub-1: product（无依赖）
  → sub-2: cart（blocked_by: [sub-1]）
  → execution_order: Group1[sub-1] → Group2[sub-2]
  → 收集 decomposition_evidence: {
      boundary_rationale: [{sub:"sub-1", reason:"独立 product domain"},{sub:"sub-2", reason:"依赖 product unit"}],
      dependency_graph: [{from:"sub-2", to:["sub-1"]}],
      unit_isolation_check: {ok: true, overlapping_units: []}
    }

Claude → opc_flow_step_complete({step:"task_decomposition", sub_pipelines, execution_order, decomposition_evidence})
  → 经 P3 V1-V5 全 pass + meta-validator 无严重 objection（走 opc_reflect_execute(inline:true) → opc_flow_reflect 两步）→ 自动推进 → 路由 brief_generation
  → Claude 通知: "已自动拆分为 2 条子管线（P3 evidence 通过 V1-V5）"

Claude → opc_flow_step_complete({step:"brief_generation", brief_content, brief_evidence}) → opc_pipeline_create({...sub_pipelines...})
  → state-server 写入 pipeline-plan.json
  → 返回 flow_next: opc_knowledge_open

Claude → opc_knowledge_open → flow_next: opc_phase_start (sub-1)

[sub-1 各 phase 跑完]

opc_phase_complete(sub-1, 最后 phase) → {
  next_phase: null,
  pipeline_progress: {
    current_sub: "sub-1", current_sub_status: "completed",
    next_sub_pipeline: {id: "sub-2", reason: "blocked_by 全 completed"}
  },
  flow_next: { tool: "opc_phase_start", args: {sub_pipeline_id: "sub-2", phase: "04-implement-design"} }
}

Claude 按 flow_next 启动 sub-2 → ... → opc_pipeline_lifecycle({action:"complete"})
```

**关键改进**：`opc_phase_complete` 返回 `pipeline_progress.next_sub_pipeline` + `flow_next`，Claude 不需要猜下一步该启动哪条子管线。

**结论**：✓ 无缺口。

---

## 相关文档

- [07_split-5-sub.md](07_split-5-sub.md) — 下一场景：5 条子管线
- [../../02-opc-state-server/02-pipeline/05_single-vs-split.md](../../02-opc-state-server/02-pipeline/05_single-vs-split.md) — 拆分依据
