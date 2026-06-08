# 完整流程示例与精确命令

> 本文档是 [意图分析总览](../01_intent-analysis-overview.md) 的子文档。其他子文档：
> [Hook 与混合架构](01_hook-architecture.md) · [流程工具 · 入口与生命周期](02_flow-tools-entry-lifecycle.md) · [流程工具 · 步骤路由](03_flow-tools-step-routing.md) · [流程工具 · 修订与重启](04_flow-tools-revise-restart.md) · [意图识别](05_intent-recognition.md) · [任务分析](06_task-analysis.md) · [任务拆分](07_task-decomposition.md) · [工作单生成](08_brief-generation.md) · [管线创建与阶段执行](09_pipeline-creation.md) · [flow-state schema](10_flow-state-schema.md)

---

## 十二、完整流程示例

```
用户: "实现用户认证系统"
  │
  ▼ UserPromptSubmit hook → "先调 opc_flow_query"
Claude → opc_flow_query()
  │
  ▼ opc_flow_query 返回 active=false + suggested_actions (含 opc_flow_start) + methodology
Claude 判断: 任务消息 → 按 suggested_actions[0] 调用
Claude → opc_flow_start({user_message: "..."})
  │
  ▼ opc_flow_start 返回 intent_analysis 指令 + methodology
Claude → 按方法论判断 → intent: task, confidence: 0.85
Claude → opc_intent_complete({intent: "task", confidence: 0.85})
  │
  ▼ opc_intent_complete 路由 task 分支，返回 task_analysis 指令 + prerequisites
Claude → opc_knowledge_list() → []
Claude → 按方法论 7 步分析 + 自省打分 → analysis_confidence: 0.88
Claude → opc_task_analysis_complete({..., analysis_confidence: 0.88})
  │
  ▼ opc_task_analysis_complete 判定：高置信度 + complexity=medium + modify_count=1 → 路由 brief_generation
Claude → 按模板生成 brief markdown
Claude → opc_brief_complete({brief_content: "..."})
  │
  ▼ opc_brief_complete 路由，返回 next: opc_pipeline_create（预填全部参数）
Claude → opc_pipeline_create({...预填...})
  │
  ▼ 返回 flow_next: opc_knowledge_open
Claude → opc_knowledge_open({units: ["user-auth"]})
  │
  ▼ 返回 flow_next: opc_phase_start
Claude → opc_phase_start({pipeline_id, sub_id: "sub-1", phase: "04-implement-design"})
  │
  ▼ 进入阶段执行循环（详见 ../03_phase-overview.md）
```

**流程中追加需求示例（用户半路说"还要加手机号登录"）：**

```
当前 step: phase_execution / pointer: sub-1 / 04-implement-design / api-design

用户新消息: "对了，还要加手机号登录"
  │
  ▼ UserPromptSubmit hook → "先调 opc_flow_query"
Claude → opc_flow_query()
  │
  ▼ 返回 active=true + snapshot（含当前位置）+ 9 种 suggested_actions
Claude 判断: 用户在补充任务范围 → 选 "补充任务范围" 分支
Claude → opc_flow_restart({from_step: "task_analysis",
                            additional_input: "对了，还要加手机号登录"})
  │
  ▼ opc_flow_restart 回退 flow-state.json 到 task_analysis 步骤，把追加输入并入 user_message_history
Claude → 重新做 7 步分析（user_message 已含两部分）
... 后续流程同上
```

**管线内增节点示例（用户说"加上安全审计"）：**

```
当前 step: phase_execution / pointer: sub-1 / 05-implement / tdd-implementation

用户新消息: "记得加上安全审计"
  │
  ▼ Claude → opc_flow_query() → 9 种 suggested_actions
Claude 判断: 管线内增节点 → 不影响当前 node 执行
Claude → opc_pipeline_replan({
  pipeline_id: "pipeline-xxx",
  changes: {add_phase_node: [{phase: "06-testing", node: "security-review"}]}
})
  │
  ▼ state.json 06-testing 加上 security-review 节点
Claude 继续按原 flow_next 推进当前 node（安全审计自然在 06 阶段执行）
```

---

## 十三、精确命令

| 命令 | 用途 |
|------|------|
| `/opc-status` | Claude 调 `opc_flow_query` + `opc_pipeline_status` 查看流程 + 管线状态 |
| `/opc-phase` | 手动跳转/重试某个阶段 |
| `/opc-nodes` | 查看当前阶段的节点选项 |
| `/opc-resume` | Claude 调 `opc_flow_recover` 手动触发流程恢复 |
| `/opc-abort` | Claude 调 `opc_flow_abort` 终止当前流程 |
| `/opc-revise <field> <value>` | Claude 调 `opc_flow_revise` 修改累积参数 |
| `/opc-restart <from_step>` | Claude 调 `opc_flow_restart` 从某步重做 |

---

