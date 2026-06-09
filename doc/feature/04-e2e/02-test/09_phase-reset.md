# 09 阶段重置

> 本文档是 [test 总览](00_overview.md) 的子文档。其他子文档：
> [闲聊](01_chat.md) · [项目知识问答](02_project-question.md) · [low 快速通道](03_low-complexity.md) · [medium 单管线](04_medium-single.md) · [high 单管线](05_high-single.md) · [3 子管线](06_split-3-sub.md) · [5 子管线](07_split-5-sub.md) · [管线恢复](08_recovery.md) · [取消管线](10_abort.md)

---

**输入**："api 设计有问题，回到 04-implement-design 重新规划"

> 工具名约定：本文档统一使用 [07-tool-consolidation](../../07-tool-consolidation/00_overview.md) 合并后的新工具名。`opc_phase_reset` 已合并到 `opc_flow_correct({action:"phase_reset"})`。

```
当前: 05-implement/backend-endpoint 执行中

Claude → opc_flow_correct({action:"phase_reset", pipeline_id, sub_pipeline_id:"sub-1", phase:"04-implement-design"})
  → 读 state.json.phases["04-implement-design"].confirm_commit_ref
  → 对每个 output.knowledge 路径:
      git show <ref>:opc-knowledge/...  →  base 内容
      读当前 .md                          →  current_version (假设 v=5)
      opc_knowledge_write({content: base, base_version: 5}) → v=6
  → 04-implement-design → pending（所有 node 重置）
  → 05-implement → pending（下游级联）
  → 06-testing → pending
  → 下次 opc_phase_confirm 时自然写新的 confirm_commit_ref
  → 返回 { reverted_paths: [{path, from_version: 5, to_version: 6}, ...] }

Claude → opc_phase_start("04-implement-design")
  → 重新走节点选择 → 确认（此时再 git commit 一个新锚点） → 执行

opc_node_start("api-design") → Agent 重新设计
  → opc_knowledge_read({mode:"batch"}) → 加载 v=6 的知识（内容 == 锚点 commit）
  → 重新设计方案
  → opc_knowledge_write({base_version: 6}) → v=7
```

**结论**：✓ 链路完整。version 单调递增（5 → 6 → 7），base_version 探测器始终工作，无需自建 `.opc-knowledge-history/`。

---

## 相关文档

- [10_abort.md](10_abort.md) — 下一场景：取消管线
- [../../02-opc-state-server/03-phase/06_phase-complete-reset.md](../../02-opc-state-server/03-phase/06_phase-complete-reset.md) — 重置级联
