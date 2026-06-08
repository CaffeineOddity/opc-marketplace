# 09 阶段重置

> 本文档是 [test 总览](../02_test-overview.md) 的子文档。其他子文档：
> [闲聊](01_chat.md) · [项目知识问答](02_project-question.md) · [low 快速通道](03_low-complexity.md) · [medium 单管线](04_medium-single.md) · [high 单管线](05_high-single.md) · [3 子管线](06_split-3-sub.md) · [5 子管线](07_split-5-sub.md) · [管线恢复](08_recovery.md) · [取消管线](10_abort.md)

---

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

## 相关文档

- [10_abort.md](10_abort.md) — 下一场景：取消管线
- [../../02-opc-state-server/phase/06_reset-cascade.md](../../02-opc-state-server/phase/06_reset-cascade.md) — 重置级联
