# 03 低复杂度快速通道

> 本文档是 [test 总览](00_overview.md) 的子文档。其他子文档：
> [闲聊](01_chat.md) · [项目知识问答](02_project-question.md) · [medium 单管线](04_medium-single.md) · [high 单管线](05_high-single.md) · [3 子管线](06_split-3-sub.md) · [5 子管线](07_split-5-sub.md) · [管线恢复](08_recovery.md) · [阶段重置](09_phase-reset.md) · [取消管线](10_abort.md)

---

**输入**："修复登录页按钮颜色不对"

> 工具名约定：本文档统一使用 [07-tool-consolidation](../../07-tool-consolidation/00_overview.md) 合并后的新工具名。

```
Claude → opc_flow_query → 返回 active: false
Claude → opc_flow_lifecycle({action:"start"}) → 返回 intent_analysis 指令
Claude → opc_flow_step_complete({step:"intent_analysis", intent: "task", intent_evidence: {task_criteria_hits: ["action_verb:修复", "deliverable:登录页按钮"], chat_signals: [], user_quotes: ["修复登录页按钮颜色不对"]}, reasoning: "动作动词+明确缺陷描述"})
  → 经 P1 V1-V5 全 pass → 路由: 返回 task_analysis 指令 + prerequisites:[opc_knowledge_read(mode:"list")]
Claude → opc_knowledge_read({mode:"list"}) → user-auth 有 login, register, session
Claude → 7 步分析 → complexity: low, knowledge_plan: [{path: "user-auth/login/ui", operation: "update"}]
Claude → opc_flow_step_complete({step:"task_analysis", analysis_result:{complexity: "low", knowledge_unit: ["user-auth"], ...}, task_analysis_evidence:{...}})
  → 判定: complexity=low → 路由 opc_quick_dispatch
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

**调用次数**：6（query + flow_lifecycle + step_complete(intent) + knowledge_read(list) + step_complete(task_analysis) + quick_dispatch）

**结论**：✓ opc_quick_dispatch 内部自动标记流程 complete + 附带 knowledge_context，Claude 不需要瞎猜改哪个文件。

---

## 相关文档

- [04_medium-single.md](04_medium-single.md) — 下一场景：中等复杂度单管线
