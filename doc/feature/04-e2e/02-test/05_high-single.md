# 05 高复杂度单管线

> 本文档是 [test 总览](00_overview.md) 的子文档。其他子文档：
> [闲聊](01_chat.md) · [项目知识问答](02_project-question.md) · [low 快速通道](03_low-complexity.md) · [medium 单管线](04_medium-single.md) · [3 子管线](06_split-3-sub.md) · [5 子管线](07_split-5-sub.md) · [管线恢复](08_recovery.md) · [阶段重置](09_phase-reset.md) · [取消管线](10_abort.md)

---

**输入**："重构 user 模块，把 session 管理从 cookie 改成 JWT"

```
Claude → opc_flow_query → opc_flow_start → opc_intent_complete({intent: "task", confidence: 0.9})
Claude → opc_knowledge_list
Claude 分析: complexity: high（改协议，影响面大）
Claude → opc_task_analysis_complete({complexity: "high", knowledge_unit: ["user-auth"]})
  → opc_task_analysis_complete 路由 brief_generation（modify_unit_count=1 跳过 decomposition）

Claude → opc_brief_complete → opc_pipeline_create

opc_phase_start("04-implement-design")
  → 高复杂度：不可跳过任何匹配节点，候选全进
  → 候选: [api-design(0.92), database-schema(0.78), scaffold(0.72)]
  → Claude 自省: 0.79 < 0.85 且 ≥ 0.64 → 快速确认
  → complexity=high → auto_advance: false（每阶段必须用户确认）

... [执行流程同 #4，但每节点更严格]

opc_phase_complete("04-implement-design")
  → 按公式计算: complexity=high → auto_advance: false
  → 提示用户确认推进

opc_phase_start("05-implement") → ... [同理]

opc_pipeline_complete
```

**关键改进**：auto_advance 公式已在 `phase/08_tools-and-automation.md §自动机制` 明确（complexity != high + 100% completed + selection_confidence ≥ threshold×0.9 + 下一 phase 在 suggested_phases 中）。

**结论**：✓ 无缺口。

---

## 相关文档

- [06_split-3-sub.md](06_split-3-sub.md) — 下一场景：3 条子管线
- [../../02-opc-state-server/03-phase/08_tools-and-automation.md](../../02-opc-state-server/03-phase/08_tools-and-automation.md) — auto_advance 公式
