# 04 中等复杂度单管线

> 本文档是 [test 总览](00_overview.md) 的子文档。其他子文档：
> [闲聊](01_chat.md) · [项目知识问答](02_project-question.md) · [low 快速通道](03_low-complexity.md) · [high 单管线](05_high-single.md) · [3 子管线](06_split-3-sub.md) · [5 子管线](07_split-5-sub.md) · [管线恢复](08_recovery.md) · [阶段重置](09_phase-reset.md) · [取消管线](10_abort.md)

---

**输入**："给用户认证系统加个短信验证码登录"

> 工具名约定：本文档统一使用 [07-tool-consolidation](../../07-tool-consolidation/00_overview.md) 合并后的新工具名。反思工具面展开示例（plan/execute/complete 三步铁律）见 [14_reflection-tool-surface.md](14_reflection-tool-surface.md)。

```
Claude → opc_flow_query → 返回 active: false
Claude → opc_flow_lifecycle({action:"start"}) → 返回 intent_analysis 指令
Claude → opc_flow_step_complete({step:"intent_analysis", intent: "task", intent_evidence: {task_criteria_hits: ["action_verb:加", "deliverable:短信验证码登录"], chat_signals: [], user_quotes: ["给用户认证系统加个短信验证码登录"]}, reasoning: "动作动词+具体子功能交付物"})
  → 经 P1 V1-V5 全 pass → 路由: task_analysis 指令

Claude → opc_knowledge_read({mode:"list"}) → user-auth/login(v2), user-auth/session(v3)

Claude 分析:
  → complexity: medium
  → knowledge_unit: [user-auth]  ← 只改 1 个 unit
  → suggested_phases: [04-implement-design, 05-implement, 06-testing]
  → phase_selection_rationale: "add-feature + medium：跳过 00/01/03，直接从实现设计到测试"
  → scenario: add-feature
  → task_analysis_evidence: {requirements:[{text:"短信验证码登录", source_quote:"..."}], dependencies:["sms-gateway"], complexity_signals:{needs_design:true, one_round_solvable:true, verdict:"medium"}, phase_selection_rationale: "..."}

Claude → opc_flow_step_complete({step:"task_analysis", analysis_result, task_analysis_evidence})
  → 经 P2 V1-V5 全 pass + modify_unit_count=1 → 路由 brief_generation

Claude → 生成 brief → opc_flow_step_complete({step:"brief_generation", brief_content})
  → 返回 next: opc_pipeline_create 预填全部参数

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
  → sub-agent: opc_knowledge_read({mode:"batch"}) + opc_knowledge_write
  → opc_node_finish({status:"success", evidence}) → { unblocked_nodes: ["database-schema"] }

opc_node_start("database-schema") → ... → opc_node_finish({status:"success"}) → { unblocked_nodes: [] }

opc_phase_complete → {
  next_phase: "05-implement",
  auto_advance: true,
  pipeline_progress: { next_sub_pipeline: null, current_sub_status: "in_progress" }
}

[Claude 按 auto_advance 自动推进]

opc_phase_start("05-implement")
  → 候选: [tdd-implementation, backend-endpoint, security-review] + reflection_budget_hint{max_rounds: 3}
  → Claude 收集第 1 轮 selection_evidence: V5 discrimination fail（backend-endpoint 与 auth 相关节点文件域冲突）
  → 走反思工具面（详细 5 步 / 3 步 inline 见 [14_reflection-tool-surface.md](14_reflection-tool-surface.md)）：
    · opc_reflect_execute({step:"node_selection", method:"critique", inline:true, artifact:{selection_evidence}})
    · → 返回 { verdict:"objections_remain", kept_objections:[{text:"backend-endpoint 与 auth 节点冲突"}], pending_reflection:{reflection_id} }
    · opc_flow_reflect({reflection_id}) → 持久化到 state.json.phases[].reflection_log + flow-state 指针
  → Claude 调整方案（移除 backend-endpoint）→ 第 2 轮反思
    · opc_reflect_execute({step:"node_selection", method:"critique", inline:true, artifact:{修正后 evidence}})
    · → 返回 { verdict:"clean", pending_reflection:{reflection_id} }
    · opc_flow_reflect({reflection_id}) → 跳出，路由 phase_confirm
  → opc_phase_confirm

opc_node_start ... → ... → opc_phase_complete

[06-testing 类似]

opc_pipeline_lifecycle({action:"complete"}) → manifest.md
```

**关键改进**：
- 节点选择反思走 `opc_reflect_execute(inline:true) → opc_flow_reflect` 两步铁律，登记后持久化到 state.json（不是 flow-state.json），随 phase_reset 自然回退
- unblocked_nodes 严格语义已在 state-manager 实现——只在 blocked_by 全部 completed 时返回
- node_start 返回 dispatch_context，sub-agent 在隔离 context 中也能正确调 opc_knowledge_write 时携带 metadata

**结论**：✓ 无缺口。

---

## 相关文档

- [05_high-single.md](05_high-single.md) — 下一场景：高复杂度单管线
- [../01-walkthrough/00_overview.md](../01-walkthrough/00_overview.md) — 完整 walkthrough（同类型场景的全流程展开）
