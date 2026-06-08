# 01 两层 Plan 模型

管线（pipeline）是 opc-state-server 的核心数据模型。所有管线工具直接操作 `pipeline-plan.json` 和 `state.json` 两份文件。

---

## 两层 Plan

| Plan | 位置 | 生成时机 | 内容 |
|------|------|---------|------|
| **管线编排计划** | `pipeline-plan.json` | `opc_pipeline_create` | 子管线列表、依赖关系、执行分组 |
| **阶段节点计划** | `state.json` → `phases[].nodes[]` | `opc_phase_confirm` | 当前 phase 选中的 node 列表、blocked_by、分组 |

**编排层**回答“整个任务怎么拆、按什么顺序跑”；**执行层**回答“当前 phase 里要跑哪些 node、谁阻塞谁”。两层一旦写入即冻结，后续调整通过 `opc_pipeline_replan` / `opc_phase_adjust` 受控变更。

---

## 相关文档

- [02_directory-structure.md](02_directory-structure.md) — 文件落盘位置
- [03_pipeline-plan.md](03_pipeline-plan.md) — `pipeline-plan.json` schema
- [04_state-json.md](04_state-json.md) — `state.json` schema
