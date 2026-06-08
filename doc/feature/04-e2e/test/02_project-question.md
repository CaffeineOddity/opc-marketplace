# 02 项目知识问答

> 本文档是 [test 总览](../02_test-overview.md) 的子文档。其他子文档：
> [闲聊](01_chat.md) · [low 快速通道](03_low-complexity.md) · [medium 单管线](04_medium-single.md) · [high 单管线](05_high-single.md) · [3 子管线](06_split-3-sub.md) · [5 子管线](07_split-5-sub.md) · [管线恢复](08_recovery.md) · [阶段重置](09_phase-reset.md) · [取消管线](10_abort.md)

---

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

## 相关文档

- [03_low-complexity.md](03_low-complexity.md) — 下一场景：low 快速通道
- [../../03-opc-knowledge-server/knowledge-api/02_core-tools.md](../../03-opc-knowledge-server/knowledge-api/02_core-tools.md) — `opc_knowledge_search` 规范
