# OPC 完整链路测试

10 个输入从简单到复杂，逐条追踪 MCP 调用链，检查工具覆盖和流程完整性。

---

## 1. 闲聊 / 无 OPC 介入

**输入**："你好，今天天气怎么样"

```
UserPromptSubmit hook 注入"先调 opc_flow_query"
  → Claude → opc_flow_query()
  → opc_flow_query 返回 active: false + suggested_actions (含 opc_flow_start 等)
  → Claude 判断: 闲聊 → 选 suggested_actions[chat] → 直接走 opc_flow_start
  → Claude → opc_flow_start({user_message: "你好，今天天气怎么样"})
  → opc_flow_start 返回 intent_analysis 指令
  → Claude 判断 → intent: chat, confidence: 0.95
  → Claude → opc_intent_complete({intent: "chat", confidence: 0.95})
  → opc_intent_complete 路由: { done: true, action: respond_normally, status: completed }
  → Claude 直接回答（flow-state.status 已自动标记 completed）
```

**调用次数**：3（opc_flow_query + opc_flow_start + opc_intent_complete）

**结论**：✓ 无缺口。流程层会留下 3 次轻量调用，但完全不创建任何 pipeline/knowledge 资源；status=completed 后下次 hook 不会误判残留流程。

---

## 2. 项目知识问答

**输入**："我们的用户认证是怎么设计的？"

```
Claude → opc_flow_query() → opc_flow_query 返回 active: false + suggested_actions
Claude → opc_flow_start → opc_flow_start 返回 intent_analysis 指令
Claude → 判断 → intent: project_question, confidence: 0.9
Claude → opc_intent_complete({intent: "project_question", confidence: 0.9})
  → opc_intent_complete 路由: {
      action: "respond_with_knowledge",
      prerequisites: [{tool: "opc_knowledge_search", args: {query: "用户认证设计"}}],
      status: "completed"     ← opc_intent_complete 内部自动标记
    }
Claude → opc_knowledge_search("用户认证设计")
  → 匹配: user-auth/login/architecture, user-auth/session/api
Claude → 注入知识上下文 → 回答用户
```

**调用次数**：4（query + flow_start + intent_complete + knowledge_search）

**结论**：✓ 无缺口。opc_intent_complete 标记 status=completed 避免下次 hook 误判。

---

## 3. 低复杂度快速通道

**输入**："修复登录页按钮颜色不对"

```
Claude → opc_flow_query → opc_flow_query 返回 active: false
Claude → opc_flow_start → opc_flow_start 返回 intent_analysis 指令
Claude → opc_intent_complete({intent: "task", confidence: 0.9})
  → opc_intent_complete 路由: 返回 task_analysis 指令 + prerequisites:[opc_knowledge_list]
Claude → opc_knowledge_list → user-auth 有 login, register, session
Claude → 7 步分析 → complexity: low, knowledge_plan: [{path: "user-auth/login/ui", operation: "update"}]
Claude → opc_task_analysis_complete({complexity: "low", knowledge_unit: ["user-auth"], ...})
  → opc_task_analysis_complete 判定: complexity=low → 路由 opc_quick_dispatch (opc_quick_dispatch)
  → 返回: {step: "quick_dispatch", next: {tool: "opc_quick_dispatch", args: {...}}}
Claude → opc_quick_dispatch({description, tags, knowledge_unit: ["user-auth"]})
  → opc_quick_dispatch 返回: {
      agent_hint: "frontend-engineer",
      knowledge_context: { units: {"user-auth": {login: {ui: {version: 1}}}} },
      dispatch_context: { instruction_template: "..." },
      status: "completed"   ← 流程内部标记，写 quick-history.jsonl
    }
Claude → Task spawn frontend-engineer 按 dispatch_context 直接执行改动
```

**调用次数**：5（query + flow_start + intent_complete + knowledge_list + task_analysis_complete + quick_dispatch）

**结论**：✓ opc_quick_dispatch quick_dispatch 内部自动标记流程 complete + 附带 knowledge_context，Claude 不需要瞎猜改哪个文件。

---

## 4. 中等复杂度单管线

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

## 5. 高复杂度单管线

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

**关键改进**：auto_advance 公式已在 `02-3 §十` 明确（complexity != high + 100% completed + selection_confidence ≥ threshold×0.9 + 下一 phase 在 suggested_phases 中）。

**结论**：✓ 无缺口。

---

## 6. 拆分管线（3 条子管线）

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

## 7. 拆分管线（5 条子管线，电商完整）

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
  execution_order: Group1[sub-1 ∥ sub-2] → Group2[sub-3] → Group3[sub-4]

Claude → opc_decomposition_complete → opc_decomposition_complete 路由 brief_generation
Claude → opc_brief_complete → opc_pipeline_create

按 execution_order 推进:
  Group1: 单 session 内交错推进 sub-1 + sub-2 phases
    → sub-1 全 phase completed
    → sub-2 全 phase completed → ready_sub_pipelines 包含 sub-3 ✓
  Group2: sub-3 phases → completed → ready_sub_pipelines 包含 sub-4 ✓
  Group3: sub-4 phases → opc_pipeline_complete
```

**关键改进**：
1. 单 session 内"并行"实质是交错执行。Claude 通过 `opc_pipeline_status` 或 `opc_phase_complete` 返回的 `pipeline_progress` 查看全局调度。
2. failed 子管线的 downstream 不会出现在 `ready_sub_pipelines` 里（state-manager 聚合规则）。

**结论**：✓ 无缺口。

---

## 8. 管线恢复

**输入**：（断电重连，上次在 05-implement/tdd-implementation 中间）

```
Session 启动后用户首次发消息（任意内容）
UserPromptSubmit hook → 注入"先调 opc_flow_query"
Claude → opc_flow_query()
  → 读 .opc/sessions/<id>/flow-state.json → status: in_progress, owner.pid=12345
  → 检查 pid 存活 → 已死（孤儿）
  → 返回:
    {
      active: true,
      orphan: true,
      owner: {pid: 12345, alive: false},
      snapshot: {
        current_step: "phase_execution",
        pipeline_id: "pipeline-001",
        current_pipeline_pointer: {sub_pipeline_id: "sub-1", phase: "05-implement", node: "tdd-implementation"}
      },
      suggested_actions: [
        {intent: "恢复流程", next: {tool: "opc_flow_recover"}},
        {intent: "放弃并开新流程", next: {tools: ["opc_flow_abort", "opc_flow_start"]}}
      ],
      orphan_pipelines: [{id: "pipeline-001", last_active: "...", suggest: "opc_pipeline_recover"}]
    }

用户: "恢复"

Claude → opc_flow_recover()
  → owner.pid 接管为当前 pid
  → 检测 current_pipeline_pointer 非空 → 内部调 opc_pipeline_recover(pipeline-001)
    · in_progress node tdd-implementation 超时（>30 min 无心跳）→ 自动标记 failed (error.type: timeout)
  → 返回:
    {
      recovered: true,
      resume_step: "phase_execution",
      resume_pointer: {sub_pipeline_id: "sub-1", phase: "05-implement", node: "tdd-implementation"},
      next: {tool: "opc_node_retry", args: {node_name: "tdd-implementation"}},
      recoverable_nodes: [{name: "tdd-implementation", status: "failed", suggested_action: "opc_node_retry"}]
    }

Claude → opc_node_retry("tdd-implementation") → 级联重置下游 → 重跑
```

**关键改进**：opc_flow_recover `opc_flow_recover` 自动 timeout 检测，避免脏 in_progress 状态卡死。无需独立 SessionStart hook。

**结论**：✓ 无缺口。

---

## 9. 阶段重置

**输入**："api 设计有问题，回到 04-implement-design 重新规划"

```
当前: 05-implement/backend-endpoint 执行中

Claude → opc_phase_reset(pipeline_id, sub-1, "04-implement-design")
  → 从 .opc/snapshots/.../04-implement-design/ 恢复 knowledge 文件
  → 04-implement-design → pending（所有 node 重置）
  → 05-implement → pending（下游级联）
  → 06-testing → pending
  → 立即对 04-implement-design 重新生成快照（保证可重复 reset）
  → 返回 { reset_phases: [...] }

Claude → opc_phase_start("04-implement-design")
  → 重新走节点选择 → 确认 → 执行

opc_node_start("api-design") → Agent 重新设计
  → opc_knowledge_get_batch → 加载快照恢复后的知识
  → 重新设计方案
  → opc_knowledge_write → version 正常递增

... 重新走完整 phase
```

**结论**：✓ 链路完整。快照恢复不依赖 git。

---

## 10. 取消管线

**输入**："不做了，取消"

```
Claude → opc_flow_query → 返回 active: true + 9 种 suggested_actions
Claude 判断: 用户要彻底放弃 → 选 "彻底放弃换任务"
Claude → opc_flow_abort({reason: "user_cancel"})
  → opc_flow_abort 行为:
    · flow-state.status → aborted + aborted_at + reason
    · pipeline_id 已创建 → 自动级联 opc_pipeline_abort(kill_agents: true)
      · pipeline-plan.json: status → aborted
      · 所有 in_progress sub_pipelines/phases/nodes 标记 aborted
      · kill in_progress sub-agent 进程
      · 清理 .opc/snapshots/
    · 释放 owner (pid 清零)
  → 返回 { aborted: true, freed_pipeline_id: "pipeline-001", killed_agent_pids: [...] }

下次用户消息:
  hook 注入"先调 opc_flow_query"
  Claude → opc_flow_query → status=aborted → 返回 active: false + suggested_actions（含 opc_flow_start）
  （aborted 状态不会被误判为活跃流程）
```

**关键改进**：opc_flow_abort `opc_flow_abort` 自动级联管线 abort + kill sub-agent，无需 Claude 分两步调。

**结论**：✓ 链路完整。

---

## 汇总

### 已修复的问题（混合方案落地）

| # | 测试 | 原问题 | 已修复方式 |
|---|------|--------|-----------|
| 1 | #3 | low 复杂度时 Agent 缺知识引导 | opc_quick_dispatch opc_quick_dispatch 返回 agent_hint + knowledge_context + dispatch_context；流程内部 status=completed |
| 2 | #6 | 跨子管线的 ready 检测无通知 | `opc_phase_complete` 返回 `pipeline_progress.ready_sub_pipelines` + `flow_next` |
| 3 | #7 | 子管线失败对 downstream 的影响 | state-manager 聚合规则：blocked_by 全 completed 且 upstream 无 failed |
| 4 | #8 | crash 导致的脏 in_progress 状态 | opc_flow_recover `opc_flow_recover` 自动 timeout 检测，标记 failed |
| 5 | #4 | 并行场景误解锁下游 | unblocked_nodes 严格语义（blocked_by 全 completed 才返回） |
| 6 | #5 | auto_advance 计算规则不明 | 公式落地到 `02-3 §十` |
| 7 | 全部 | 反思循环零持久化 | opc_flow_reflect `opc_flow_reflect` 按 step_id 分流：task→flow-state；node_selection→state.json + flow-state 指针 |
| 8 | 全部 | pipeline 文档链无硬跳转 | MCP 状态机驱动 + methodology 引用 |
| 9 | 全部 | hook 重复触发会覆盖流程 | hook 改为提示调 opc_flow_query，由 query + Claude 决策 9 种延续模式 |
| 10 | #1, #2, #3 | project_question / chat / low 流程不终结 | opc_intent_complete/opc_quick_dispatch 内部自动标记 status=completed |
| 11 | #10 | abort 不处理 in_progress sub-agent | opc_flow_abort + opc_pipeline_abort(kill_agents: true) 默认杀进程 |
| 12 | 全部 | 跨步骤参数无累积存储 | flow-state.json schema 完整定义 + accumulated 字段 |
| 13 | 全部 | crash 后无法精确恢复到 phase/node | 阶段/节点工具同步更新 current_pipeline_pointer + heartbeat |
| 14 | 全部 | 工具乱序调用无保护 | 每个 F 工具前置校验 current_step ∈ expected_steps |

### 流程修改/纠错能力（新工具集）

| 用户意图 | 工具 | 说明 |
|---------|------|------|
| 启动新任务 | `opc_flow_start` | active=false 时由 query 引导调用 |
| 延续推进 | 按 flow_next 推进 | 不调任何 flow 工具 |
| 修改累积参数 | `opc_flow_revise(field, value)` | complexity / phases / scenario 等局部修订 |
| 回退某分析步骤 | `opc_flow_restart(from_step, additional_input?)` | 保留前置 accumulated，可附补充输入 |
| 管线内增删节点 | `opc_pipeline_replan(changes)` | 细粒度：add_phase_node / remove / replace / add_phase / change_complexity |
| 废弃某阶段产出 | `opc_phase_reset` | 快照恢复 + 立即重生快照 |
| 彻底放弃 | `opc_flow_abort` | 自动级联 opc_pipeline_abort + kill_agents |
| 恢复孤儿流程 | `opc_flow_recover` | pid 接管 + 超时检测 |
| 调试可观测 | `opc_flow_query` | 查看 snapshot + history + reflection_log |

### 待评估问题（P2 优先级）

| # | 问题 | 建议 |
|---|------|------|
| 1 | `opc_knowledge_write` 不更新 _refs | 加 `refs?: string[]` 参数显式声明 |
| 2 | 多 session 并发写同一 knowledge | 加 `expected_version?` 乐观锁 |
| 3 | project_question 升级 task 上下文丢失 | 缓存 last-query.json |
| 4 | knowledge_open 跨子管线聚合策略 | 当前选 A（聚合 open 所有 unit），文档已明确 |
| 5 | sub-agent 工具权限校验 | kit 的 agents/*.md 强制声明必备工具集 |
