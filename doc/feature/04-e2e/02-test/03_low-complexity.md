# 03 低复杂度快速通道

> 本文档是 [test 总览](00_overview.md) 的子文档。其他子文档：
> [闲聊](01_chat.md) · [项目知识问答](02_project-question.md) · [medium 单管线](04_medium-single.md) · [high 单管线](05_high-single.md) · [3 子管线](06_split-3-sub.md) · [5 子管线](07_split-5-sub.md) · [管线恢复](08_recovery.md) · [阶段重置](09_phase-reset.md) · [取消管线](10_abort.md)

---

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

## 相关文档

- [04_medium-single.md](04_medium-single.md) — 下一场景：中等复杂度单管线
