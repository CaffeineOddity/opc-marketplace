# 10 完整调用链路示例

从用户消息到管线完成的端到端工具调用序列。

---

## 一、单管线

```
用户: "实现用户认证系统"

① Hook 注入"先调 opc_flow_query"指令
② Claude → opc_flow_query → 返回 active=false + suggested_actions
③ Claude → opc_flow_start → 返回 intent_analysis 指令 + methodology
④ Claude → 判断 intent=task → opc_intent_complete({intent: "task", intent_evidence, reasoning})
⑤ opc_intent_complete 经 P1 V1-V5 全 pass → 返回 task_analysis 指令
⑥ Claude → opc_knowledge_list → 7 步分析 + 收集 task_analysis_evidence → opc_task_analysis_complete
⑦ opc_task_analysis_complete 经 P2 V1-V5 全 pass + medium + modify_unit_count=1 → 路由 brief_generation
⑧ Claude → 生成 brief → opc_brief_complete → 返回预填的 pipeline_create 参数
⑨ Claude → opc_pipeline_create → state-server 写入文件
⑩ 返回 flow_next → Claude → opc_knowledge_open
⑪ 返回 flow_next → Claude → opc_phase_start("04-implement-design")
⑫ opc_phase_adjust / opc_phase_confirm → 锁定（同步更新 current_pipeline_pointer）
⑬ 逐 node: opc_node_start → 按 node_body 执行 → opc_node_complete
⑭ opc_phase_complete → auto_advance + pipeline_progress
⑮ 回到 ⑪ → 进入 05-implement → 重复
⑯ opc_pipeline_complete → manifest.md
```

---

## 二、拆分管线

```
用户: "实现电商系统：商品+购物车+支付+用户中心"

① Hook 注入"先调 opc_flow_query"
② Claude → opc_flow_query → 返回 active=false + suggested_actions
③ Claude → opc_flow_start → 返回 intent_analysis 指令
④ Claude → 判断 intent=task → opc_intent_complete
⑤ opc_intent_complete 路由 → task_analysis 指令
⑥ Claude → opc_knowledge_list → 7 步分析 → opc_task_analysis_complete
⑦ opc_task_analysis_complete 判定: 修改 unit=5 ≥ 2 → 路由 task_decomposition
⑧ Claude → 拆分 4 条子管线 → opc_decomposition_complete({sub_pipelines, execution_order, decomposition_evidence: {boundary_rationale, dependency_graph, unit_isolation_check}})
⑨ opc_decomposition_complete 经 P3 V1-V5 全 pass + meta-validator 无严重 objection → 自动推进，路由 brief_generation
⑩ Claude → 生成 brief → opc_brief_complete
⑪ opc_brief_complete → 返回预填的 pipeline_create 参数
⑫ Claude → opc_pipeline_create → 写入 pipeline-plan.json
⑬ 返回 flow_next → opc_knowledge_open → 返回 flow_next → 进入阶段
⑭ 按 execution_order 串行执行: sub-1 → sub-2 → sub-3 → sub-4
⑮ 全部 completed → opc_pipeline_complete
```

---

## 三、其他意图

```
project_question → opc_intent_complete 路由 → action: respond_with_knowledge + prerequisites:[opc_knowledge_search]
                 → opc_intent_complete 内部标记 flow-state.status=completed
                 → Claude 调 search 后注入上下文回答（不创建管线）

general_question / chat → opc_intent_complete 路由 → done: true → 内部标记 status=completed → Claude 直接回答

task / complexity=low → opc_task_analysis_complete 路由 → action: opc_quick_dispatch → 内部标记 status=completed
                       → Agent 直接执行（无管线/无 phases/无 state），写入 .opc/quick-history.jsonl
```

---

## 四、异常路径

```
中断恢复:
  Session 启动后用户首次发消息 → UserPromptSubmit hook → opc_flow_query
    → 流程层 owner.pid 已死 + active=true → orphan: true
    → 返回 suggested_actions: [opc_flow_recover / opc_flow_abort+opc_flow_start]
    → 同时返回 orphan_pipelines（管线层孤儿）

取消:     opc_flow_abort → 自动级联 opc_pipeline_abort（含 kill in_progress sub-agent）
回退:     opc_phase_reset → 快照恢复 → 下游 pending → 立即重生快照
重跑:     opc_node_retry → 级联重置下游 → 重跑当前 node
修订:     opc_flow_revise → 修改 accumulated 字段 → 按需自动回溯
重做:     opc_flow_restart(from_step) → 回退到指定步骤 → 保留前置数据
管线改造: opc_pipeline_replan → 细粒度增删节点/阶段/子管线 → 不影响 in_progress
```

---

## 相关文档

- [06_lifecycle.md](06_lifecycle.md) — 生命周期阶段
- [09_tools.md](09_tools.md) — 6 个管线级工具规范
- [../01-intent-analysis/11_complete-example.md](../01-intent-analysis/11_complete-example.md) — 意图分析阶段的精确命令清单
