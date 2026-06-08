# 01 闲聊 / 无 OPC 介入

> 本文档是 [test 总览](00_overview.md) 的子文档。其他子文档：
> [项目知识问答](02_project-question.md) · [low 快速通道](03_low-complexity.md) · [medium 单管线](04_medium-single.md) · [high 单管线](05_high-single.md) · [3 子管线](06_split-3-sub.md) · [5 子管线](07_split-5-sub.md) · [管线恢复](08_recovery.md) · [阶段重置](09_phase-reset.md) · [取消管线](10_abort.md)

---

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

## 相关文档

- [02_project-question.md](02_project-question.md) — 下一场景：项目知识问答
