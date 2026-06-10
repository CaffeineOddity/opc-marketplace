# 01 闲聊 / 无 OPC 介入

> 本文档是 [test 总览](00_overview.md) 的子文档。其他子文档：
> [项目知识问答](02_project-question.md) · [low 快速通道](03_low-complexity.md) · [medium 单管线](04_medium-single.md) · [high 单管线](05_high-single.md) · [3 子管线](06_split-3-sub.md) · [5 子管线](07_split-5-sub.md) · [管线恢复](08_recovery.md) · [阶段重置](09_phase-reset.md) · [取消管线](10_abort.md)

---

**输入**："你好，今天天气怎么样"

> 工具名约定：本文档统一使用 [07-tool-consolidation](../../07-tool-consolidation/00_overview.md) 合并后的新工具名（如 `opc_flow_lifecycle({action:"start"})` 而非旧名 `opc_flow_lifecycle({action:"start"})`）。旧名作为 deprecated alias 在 v2.2 前仍可调用，v2.3 起移除。

```
UserPromptSubmit hook 注入"先调 opc_flow_query"
  → Claude → opc_flow_query()
  → opc_flow_query 返回 active: false + suggested_actions (含 opc_flow_lifecycle({action:"start"}) 等)
  → Claude 判断: 闲聊 → 选 suggested_actions[chat] → 直接走 opc_flow_lifecycle({action:"start"})
  → Claude → opc_flow_lifecycle({action:"start", user_message: "你好，今天天气怎么样"})
  → opc_flow_lifecycle 返回 intent_analysis 指令
  → Claude 判断 → intent: chat, intent_evidence: {task_criteria_hits: [], chat_signals: ["greeting:你好", "smalltalk:天气"], user_quotes: ["你好，今天天气怎么样"]}
  → Claude → opc_flow_step_complete({step:"intent_analysis", intent: "chat", intent_evidence: {...}, reasoning: "纯问候+闲聊话题，无动作动词/交付物"})
  → opc_flow_step_complete 经 P1 V1-V5 全 pass → 路由: { done: true, action: respond_normally, status: completed }
  → Claude 直接回答（flow-state.status 已自动标记 completed）
```

**调用次数**：3（opc_flow_query + opc_flow_lifecycle + opc_flow_step_complete）

**结论**：✓ 无缺口。流程层会留下 3 次轻量调用，但完全不创建任何 pipeline/knowledge 资源；status=completed 后下次 hook 不会误判残留流程。

---

## 相关文档

- [02_project-question.md](02_project-question.md) — 下一场景：项目知识问答
