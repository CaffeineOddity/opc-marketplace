# 06 第六步：Phase 06-testing

> 本文档是 [walkthrough 总览](00_overview.md) 的子文档。其他子文档：
> [用户输入](01_user-input.md) · [流程启动](02_flow-startup.md) · [brief → create](03_brief-to-create.md) · [phase 04](04_phase-04-implement-design.md) · [phase 05](05_phase-05-implement.md) · [pipeline 完成](07_pipeline-complete.md)

---

```
opc_phase_start("06-testing")
  → 候选: [integration-test, accessibility-audit]
  → add-feature 推荐: integration-test
  → 高置信度 → 自动通过（无需反思确认）
  → opc_phase_confirm

opc_node_start("integration-test") → Agent:
  → 运行全部测试 → 通过
  → 端到端测试: 注册 → 登录 → 获取 session → 登出 → 验证 session 失效
  → opc_knowledge_write(...)  # 如有修正

opc_node_finish({status:"completed"}) → { unblocked_nodes: [] }
opc_phase_complete → { next_phase: null }
```

---

## 相关文档

- [07_pipeline-complete.md](07_pipeline-complete.md) — 下一步：管线完成
- [../../02-opc-state-server/03-phase/00_overview.md](../../02-opc-state-server/03-phase/00_overview.md) — 阶段生命周期
