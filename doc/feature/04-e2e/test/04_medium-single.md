# 04 中等复杂度单管线

> 本文档是 [test 总览](../02_test-overview.md) 的子文档。其他子文档：
> [闲聊](01_chat.md) · [项目知识问答](02_project-question.md) · [low 快速通道](03_low-complexity.md) · [high 单管线](05_high-single.md) · [3 子管线](06_split-3-sub.md) · [5 子管线](07_split-5-sub.md) · [管线恢复](08_recovery.md) · [阶段重置](09_phase-reset.md) · [取消管线](10_abort.md)

---

**输入**："给用户认证系统加个短信验证码登录"

```
Claude → opc_flow_query → opc_flow_query 返回 active: false
Claude → opc_flow_start → opc_flow_start 返回 intent_analysis 指令
Claude → opc_intent_complete({intent: "task", confidence: 0.88})
  → opc_intent_complete 路由: task_analysis 指令

Claude → opc_knowledge_list → user-auth/login(v2), user-auth/session(v3)

Claude 分析:
  → complexity: medium
  → knowledge_unit: [user-auth]  ← 只改 1 个 unit
  → suggested_phases: [04-implement-design, 05-implement, 06-testing]
  → scenario: add-feature
  → analysis_confidence: 0.85

Claude → opc_task_analysis_complete({...})
  → opc_task_analysis_complete 判定: 0.85 ≥ 0.8 + modify_unit_count=1 → 路由 brief_generation

Claude → 生成 brief → opc_brief_complete({brief_content})
  → opc_brief_complete 返回 next: opc_pipeline_create 预填全部参数

Claude → opc_pipeline_create({sub_pipelines: [{id: sub-1, knowledge_unit: [user-auth], ...}]})
  → 返回 flow_next: opc_knowledge_open

Claude → opc_knowledge_open → 返回 flow_next: opc_phase_start

Claude → opc_phase_start("04-implement-design")
  → 候选: [api-design(0.92), database-schema(0.78)]
  → Claude 自省: 0.92 ≥ 0.85 → 自动确认
  → opc_phase_confirm
  → resolver: Group1[api-design] → Group2[database-schema]

opc_node_start("api-design") → 返回 node_body + dispatch_instruction + dispatch_context
  → Claude Task spawn backend-engineer sub-agent
  → sub-agent: opc_knowledge_get_batch + opc_knowledge_write
  → opc_node_complete → { unblocked_nodes: ["database-schema"] }

opc_node_start("database-schema") → ... → opc_node_complete → { unblocked_nodes: [] }

opc_phase_complete → {
  next_phase: "05-implement",
  auto_advance: true,
  pipeline_progress: { ready_sub_pipelines: [], current_sub_status: "in_progress" }
}

[Claude 按 auto_advance 自动推进]

opc_phase_start("05-implement")
  → 候选: [tdd-implementation(0.88), backend-endpoint(0.82), security-review(0.65)]
  → Claude 自省: 0.71 < 0.80 → 调 opc_flow_reflect(step_id: "node_selection", pipeline_id, sub_pipeline_id, phase: "05-implement")
  → opc_flow_reflect 持久化第 1 轮反思日志到 state.json.phases[].reflection_log → 返回继续反思指令
  → Claude 调整方案 → opc_flow_reflect(round=2, new_confidence=0.83)
  → opc_flow_reflect 判定: 0.83 ≥ 0.80 → 跳出，路由 phase_confirm
  → opc_phase_confirm

opc_node_start ... → ... → opc_phase_complete

[06-testing 类似]

opc_pipeline_complete → manifest.md
```

**关键改进**：
- 节点选择反思走 opc_flow_reflect 持久化到 state.json（不是 flow-state.json），随 phase_reset 自然回退
- unblocked_nodes 严格语义已在 state-manager 实现——只在 blocked_by 全部 completed 时返回
- node_start 返回 dispatch_context，sub-agent 在隔离 context 中也能正确调 opc_knowledge_write 时携带 metadata

**结论**：✓ 无缺口。

---

## 相关文档

- [05_high-single.md](05_high-single.md) — 下一场景：高复杂度单管线
- [../01_walkthrough-overview.md](../01_walkthrough-overview.md) — 完整 walkthrough（同类型场景的全流程展开）
