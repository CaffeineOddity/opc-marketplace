# 02 项目知识问答

> 本文档是 [test 总览](00_overview.md) 的子文档。其他子文档：
> [闲聊](01_chat.md) · [low 快速通道](03_low-complexity.md) · [medium 单管线](04_medium-single.md) · [high 单管线](05_high-single.md) · [3 子管线](06_split-3-sub.md) · [5 子管线](07_split-5-sub.md) · [管线恢复](08_recovery.md) · [阶段重置](09_phase-reset.md) · [取消管线](10_abort.md)

---

**输入**："我们的用户认证是怎么设计的？"

> 工具名约定：本文档统一使用 [07-tool-consolidation](../../07-tool-consolidation/00_overview.md) 合并后的新工具名。

```
Claude → opc_flow_query() → opc_flow_query 返回 active: false + suggested_actions
Claude → opc_flow_lifecycle({action:"start"}) → 返回 intent_analysis 指令
Claude → 判断 → intent: project_question, intent_evidence: {task_criteria_hits: [], chat_signals: ["question_word:怎么", "info_seeking:认证设计"], user_quotes: ["我们的用户认证是怎么设计的？"]}
Claude → opc_flow_step_complete({step:"intent_analysis", intent: "project_question", intent_evidence: {...}, reasoning: "疑问句+项目代词'我们的'，info_seeking 信号"})
  → opc_flow_step_complete 经 P1 V1-V5 全 pass → 路由: {
      action: "respond_with_knowledge",
      prerequisites: [{tool: "opc_knowledge_read", args: {mode:"search", query: "用户认证设计"}}],
      status: "completed"     ← opc_flow_step_complete 内部自动标记
    }
Claude → opc_knowledge_read({mode:"search", query:"用户认证设计"})
  → 匹配: user-auth/login/architecture, user-auth/session/api
Claude → 注入知识上下文 → 回答用户
```

**调用次数**：4（query + flow_lifecycle + step_complete + knowledge_read）

**结论**：✓ 无缺口。`opc_flow_step_complete({step:"intent_analysis"})` 标记 status=completed 避免下次 hook 误判。

---

## 相关文档

- [03_low-complexity.md](03_low-complexity.md) — 下一场景：low 快速通道
- [../../03-opc-knowledge-server/02-knowledge-api/02_core-tools.md](../../03-opc-knowledge-server/02-knowledge-api/02_core-tools.md) — `opc_knowledge_read(mode:"search")` 规范
