# 05 高复杂度单管线

> 本文档是 [test 总览](00_overview.md) 的子文档。其他子文档：
> [闲聊](01_chat.md) · [项目知识问答](02_project-question.md) · [low 快速通道](03_low-complexity.md) · [medium 单管线](04_medium-single.md) · [3 子管线](06_split-3-sub.md) · [5 子管线](07_split-5-sub.md) · [管线恢复](08_recovery.md) · [阶段重置](09_phase-reset.md) · [取消管线](10_abort.md)

---

**输入**："重构 user 模块，把 session 管理从 cookie 改成 JWT"

```
Claude → opc_flow_query → opc_flow_start → opc_intent_complete({intent: "task", intent_evidence: {task_criteria_hits: ["action_verb:重构", "deliverable:JWT session"], chat_signals: [], user_quotes: ["重构 user 模块，把 session 管理从 cookie 改成 JWT"]}, reasoning: "重构动词+协议级改造，影响面大"})
Claude → opc_knowledge_list
Claude 分析: complexity: high（改协议，影响面大）
Claude → opc_task_analysis_complete({analysis_result: {complexity: "high", knowledge_unit: ["user-auth"], phase_selection_rationale: "...", ...}, task_analysis_evidence: {...}})
  → opc_task_analysis_complete 经 P2 V1-V5 全 pass → 路由 brief_generation（modify_unit_count=1 跳过 decomposition）

Claude → opc_brief_complete → opc_pipeline_create

opc_phase_start("04-implement-design")
  → 高复杂度：reflection_budget_hint{max_rounds: 4, primary: M4, secondary: M5}
  → 候选: [api-design, database-schema, scaffold]
  → Claude 收集 selection_evidence: V4 coverage ok，但 meta-validator 保留 1 条中等 objection（scaffold 与 api-design 部分重叠）
  → P5 路径 B 快速确认（展示 reasoning_trace + objection 供用户一键确认）
  → complexity=high → auto_advance: false（每阶段必须用户确认）

... [执行流程同 #4，但每节点更严格]

opc_phase_complete("04-implement-design")
  → 按 auto_advance 4 条件评估: complexity=high → 条件 1 不满足 → auto_advance: false
  → 提示用户确认推进

opc_phase_start("05-implement") → ... [同理]

opc_pipeline_complete
```

**关键改进**：auto_advance 公式已在 `phase/06_phase-complete-reset.md §auto_advance` 明确（complexity ≠ high + 100% completed + 当前 phase 的 P5 selection_evidence 通过 V1-V5 + meta-validator 无严重 objection + 下一 phase 在 `phase_plan.selected` 中）。

**结论**：✓ 无缺口。

---

## 相关文档

- [06_split-3-sub.md](06_split-3-sub.md) — 下一场景：3 条子管线
- [../../02-opc-state-server/03-phase/06_phase-complete-reset.md](../../02-opc-state-server/03-phase/06_phase-complete-reset.md) — auto_advance 4 条件
