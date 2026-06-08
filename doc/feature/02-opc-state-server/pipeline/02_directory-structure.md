# 02 目录结构

```
.opc/pipelines/<id>/
├── pipeline-plan.json               # 管线编排计划
├── manifest.md                      # 产物清单（管线结束时汇总）
├── snapshots/                       # 知识快照（每 phase 确认时自动生成）
│   └── sub-1/
│       └── 04-implement-design/
│           ├── user-auth/login/api.md
│           └── user-auth/session/api.md
└── sub-pipelines/
    └── sub-1/                       # 单管线仅一条；拆分管线有 sub-1, sub-2...
        ├── state.json               # 子管线状态机
        ├── brief.md                 # 任务工作单
        └── phases/                  # 逐阶段摘要
            ├── 04-implement-design.md
            ├── 05-implement.md
            └── 06-testing.md
```

## 路径约定

| 路径 | 写者 | 读者 |
|------|------|------|
| `pipeline-plan.json` | `opc_pipeline_create` / `opc_pipeline_replan` | 所有管线工具 |
| `sub-pipelines/<id>/state.json` | `opc_phase_*` / `opc_node_*` | 所有阶段/节点工具 |
| `sub-pipelines/<id>/brief.md` | `opc_pipeline_create`（Claude 提供内容） | Agent 执行时 |
| `sub-pipelines/<id>/phases/*.md` | `opc_phase_complete` | 后续 phase / Agent |
| `snapshots/<sub>/<phase>/...` | `opc_phase_confirm` | `opc_phase_reset` 回退使用 |
| `manifest.md` | `opc_pipeline_complete` | 用户最终查看 |

---

## 相关文档

- [03_pipeline-plan.md](03_pipeline-plan.md) — `pipeline-plan.json` schema
- [04_state-json.md](04_state-json.md) — `state.json` schema
- [../../03-opc-knowledge-server/01_knowledge-model-overview.md](../../03-opc-knowledge-server/01_knowledge-model-overview.md) — 知识快照机制
