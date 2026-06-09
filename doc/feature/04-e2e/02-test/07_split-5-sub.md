# 07 拆分管线（5 条子管线，电商完整）

> 本文档是 [test 总览](00_overview.md) 的子文档。其他子文档：
> [闲聊](01_chat.md) · [项目知识问答](02_project-question.md) · [low 快速通道](03_low-complexity.md) · [medium 单管线](04_medium-single.md) · [high 单管线](05_high-single.md) · [3 子管线](06_split-3-sub.md) · [管线恢复](08_recovery.md) · [阶段重置](09_phase-reset.md) · [取消管线](10_abort.md)

---

**输入**："实现完整电商系统：商品管理 + 用户中心 + 购物车 + 下单支付"

```
Claude → opc_flow_query → opc_flow_start → opc_intent_complete → opc_knowledge_list
Claude → 7 步分析 → knowledge_unit: [product, user-center, cart, order, payment]
Claude → opc_task_analysis_complete
  → opc_task_analysis_complete 路由 task_decomposition

Claude 拆分:
  sub-1: product（无依赖）
  sub-2: user-center（无依赖）
  sub-3: cart（blocked_by: [sub-1, sub-2]）
  sub-4: order+payment（blocked_by: [sub-3, sub-2]）
  execution_order: sub-1 → sub-2 → sub-3 → sub-4（严格串行）

Claude → opc_decomposition_complete → opc_decomposition_complete 路由 brief_generation
Claude → opc_brief_complete → opc_pipeline_create

按 execution_order 严格串行推进:
  sub-1 全 phase completed → opc_phase_complete 返回 next_sub_pipeline=sub-2
  sub-2 全 phase completed → opc_phase_complete 返回 next_sub_pipeline=sub-3
  sub-3 全 phase completed → opc_phase_complete 返回 next_sub_pipeline=sub-4
  sub-4 全 phase completed → opc_pipeline_complete
```

**关键改进**：
1. 严格按 `execution_order` 串行执行，同一时刻只有一条 sub 在跑。Claude 通过 `opc_pipeline_status` 或 `opc_phase_complete` 返回的 `pipeline_progress.next_sub_pipeline` 查看下一条要启动的 sub。
2. failed 子管线的 downstream 不会出现在 `next_sub_pipeline` 里（state-manager 按 execution_order 顺序找首个就绪且 upstream 无 failed 的 sub）。

**结论**：✓ 无缺口。

---

## 相关文档

- [08_recovery.md](08_recovery.md) — 下一场景：管线恢复
