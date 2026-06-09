# 04 中等复杂度单管线

> 本文档是 [test 总览](00_overview.md) 的子文档。其他子文档：
> [闲聊](01_chat.md) · [项目知识问答](02_project-question.md) · [low 快速通道](03_low-complexity.md) · [high 单管线](05_high-single.md) · [3 子管线](06_split-3-sub.md) · [5 子管线](07_split-5-sub.md) · [管线恢复](08_recovery.md) · [阶段重置](09_phase-reset.md) · [取消管线](10_abort.md)

---

**输入**："给用户认证系统加个短信验证码登录"

```
Claude → opc_flow_query → opc_flow_query 返回 active: false
Claude → opc_flow_start → opc_flow_start 返回 intent_analysis 指令
Claude → opc_intent_complete({intent: "task", intent_evidence: {task_criteria_hits: ["action_verb:加", "deliverable:短信验证码登录"], chat_signals: [], user_quotes: ["给用户认证系统加个短信验证码登录"]}, reasoning: "动作动词+具体子功能交付物"})
  → opc_intent_complete 经 P1 V1-V5 全 pass → 路由: task_analysis 指令

Claude → opc_knowledge_list → user-auth/login(v2), user-auth/session(v3)

Claude 分析:
  → complexity: medium
  → knowledge_unit: [user-auth]  ← 只改 1 个 unit
  → suggested_phases: [04-implement-design, 05-implement, 06-testing]
  → phase_selection_rationale: "add-feature + medium：跳过 00/01/03，直接从实现设计到测试"
  → scenario: add-feature
  → task_analysis_evidence: {requirements:[{text:"短信验证码登录", source_quote:"..."}], dependencies:["sms-gateway"], complexity_signals:{needs_design:true, one_round_solvable:true, verdict:"medium"}, phase_selection_rationale: "..."}

Claude → opc_task_analysis_complete({analysis_result, task_analysis_evidence})
  → opc_task_analysis_complete 经 P2 V1-V5 全 pass + modify_unit_count=1 → 路由 brief_generation

Claude → 生成 brief → opc_brief_complete({brief_content})
  → opc_brief_complete 返回 next: opc_pipeline_create 预填全部参数

Claude → opc_pipeline_create({sub_pipelines: [{id: sub-1, knowledge_unit: [user-auth], ...}]})
  → 返回 flow_next: opc_knowledge_open

Claude → opc_knowledge_open → 返回 flow_next: opc_phase_start

Claude → opc_phase_start("04-implement-design")
  → 候选: [api-design, database-schema] + reflection_budget_hint{max_rounds: 2}
  → Claude 收集 selection_evidence: matched_tags + scenario_hits=["api-design","database-schema"] + coverage_gaps=[] + file_domain_conflicts=[]
  → P5 V1-V5 全 pass + meta-validator 无严重 objection → 路径 A 自动确认
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
  → 候选: [tdd-implementation, backend-endpoint, security-review] + reflection_budget_hint{max_rounds: 3}
  → Claude 收集第 1 轮 selection_evidence: V5 discrimination fail（backend-endpoint 与 auth 相关节点文件域冲突）
  → 调 opc_flow_reflect(step_id: "node_selection", round: 1, evidence_diff: {removed:[], added:[], modified:[]}, validator_result: {V5: "fail"})
  → opc_flow_reflect 持久化第 1 轮反思日志到 state.json.phases[].reflection_log → 按 M4 Critique 返回继续反思指令
  → Claude 调整方案（移除 backend-endpoint）→ opc_flow_reflect(round=2, evidence_diff: {removed:["backend-endpoint"]}, validator_result: {V1-V5: "ok"}, objections_kept_by_meta: 0)
  → opc_flow_reflect 判定: validator 全 ok + 无 objection → 跳出，路由 phase_confirm
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
- [../01-walkthrough/00_overview.md](../01-walkthrough/00_overview.md) — 完整 walkthrough（同类型场景的全流程展开）
