# 02 目录结构

```
.opc/pipelines/<id>/
├── pipeline-plan.json               # 管线编排计划
├── manifest.md                      # 产物清单（管线结束时汇总）
└── sub-pipelines/
    └── sub-1/                       # 单管线仅一条；拆分管线有 sub-1, sub-2...
        ├── state.json               # 子管线状态机
        ├── brief.md                 # 任务工作单
        └── phases/                  # 逐阶段摘要
            ├── 04-implement-design.md
            ├── 05-implement.md
            └── 06-testing.md
```

> **knowledge 历史不在 .opc/ 下**：phase 回退所需的 knowledge 历史快照走 git（`opc_phase_confirm` 时 commit + 记 `confirm_commit_ref`），不再有 `.opc/snapshots/` 目录。详见 [../03-phase/06_phase-complete-reset.md § 三](../03-phase/06_phase-complete-reset.md#三opc_flow_correctactionphase_reset--阶段重置)。

## 路径约定

| 路径 | 写者 | 读者 |
|------|------|------|
| `pipeline-plan.json` | `opc_pipeline_create` / `opc_pipeline_lifecycle({action:"replan"})` | 所有管线工具 |
| `sub-pipelines/<id>/state.json` | `opc_phase_*` / `opc_node_*` | 所有阶段/节点工具 |
| `sub-pipelines/<id>/brief.md` | `opc_pipeline_create`（Claude 提供内容） | Agent 执行时 |
| `sub-pipelines/<id>/phases/*.md` | `opc_phase_complete` | 后续 phase / Agent |
| `manifest.md` | `opc_pipeline_lifecycle({action:"complete"})` | 用户最终查看 |

---

## 相关文档

- [03_pipeline-plan.md](03_pipeline-plan.md) — `pipeline-plan.json` schema
- [04_state-json.md](04_state-json.md) — `state.json` schema
- [../../03-opc-knowledge-server/01-knowledge-model/00_overview.md](../../03-opc-knowledge-server/01-knowledge-model/00_overview.md) — 知识模型
- [../03-phase/06_phase-complete-reset.md](../03-phase/06_phase-complete-reset.md) — phase reset 的 git 锚点机制
