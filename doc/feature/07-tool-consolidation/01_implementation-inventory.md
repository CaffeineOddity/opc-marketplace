# 01 — 实现盘点：当前 server 方法 vs 目标 28 工具

> 截至 2026-06-11 的代码侧实际状态。M17 已关闭。
>
> **结论**：全部 24 个目标工具均已实现并注册为 MCP 工具。
> discriminator 风格 facade 层、old→new 别名映射（`@opc/tool-aliases`）、
> 以及内联 reflection 模式全部落地。文档改写（M17.h–k）已在 M25 完成。

## 状态矩阵

| 目标工具 | 实现位置（类.方法） | 状态 | M17 子任务 |
|---|---|---|---|
| **opc_flow_query** | `FlowServer.query` | ✅ 已对齐 | — |
| **opc_flow_lifecycle** | `FlowServer.lifecycle` | ✅ 已对齐（start/abort/recover） | — |
| **opc_flow_step_complete** | `FlowServer.stepComplete` | ✅ 已对齐（4 step） | — |
| **opc_flow_reflect** | `FlowServer.reflect` | ✅ 已对齐 | — |
| **opc_flow_user_reply** | `FlowServer.userReply` | ✅ 已对齐 | — |
| **opc_quick_dispatch** | `FlowServer.quickDispatch` | ✅ 已对齐 | — |
| **opc_flow_correct** | `FlowServer.correct` | ✅ 已对齐（revise/restart/phase_reset） | — |
| **opc_pipeline_create** | `PipelineServer.create` | ✅ 已对齐 | — |
| **opc_pipeline_status** | `PipelineServer.status` | ✅ 已对齐 | — |
| **opc_pipeline_lifecycle** | `PipelineServer.lifecycle` | ✅ 已对齐（complete/abort/replan/resume 四路分派） | — |
| **opc_phase_start** | `PhaseServer.start` | ✅ 已对齐 | — |
| **opc_phase_confirm** | `PhaseServer.confirm` | ✅ 已对齐（registry-guard 锚点 + commit 确认） | — |
| **opc_phase_complete** | `PhaseServer.complete` | ✅ 已对齐 | — |
| **opc_node_start** | `NodeServer.start` | ✅ 已对齐 | — |
| **opc_node_finish** | `NodeServer.finish` | ✅ 已对齐（completed/failed/retry 三路分派） | — |
| **opc_knowledge_open** | `KnowledgeServer.open` | ✅ 已对齐 | — |
| **opc_knowledge_read** | `KnowledgeServer.read` | ✅ 已对齐（5 mode） | — |
| **opc_knowledge_write** | `KnowledgeServer.write` | ✅ 已对齐（base_version） | — |
| **opc_knowledge_admin** | `KnowledgeServer.admin` | ✅ 已对齐（delete/reindex） | — |
| **opc_reflect_plan** | `ReflectionServer.plan` | ✅ 已对齐 | — |
| **opc_reflect_execute** | `ReflectionServer.execute` | ✅ 已对齐（M3/M4/M5/M6 + inline） | — |
| **opc_reflect_complete** | `ReflectionServer.complete` | ✅ 已对齐（6 method 分派） | — |
| **opc_reflect_admin** | `ReflectionServer.admin` | ✅ 已对齐（record_interventions/explain/query_stats/unlearn/on_demand 五路分派） | — |
| **opc_corrections** | `CorrectionsServer.crud` | ✅ 已对齐（query/record/unlearn/reindex/promote 五路分派） | — |

## 关键判断

1. **业务逻辑保留**：所有 facade 都不动 underlying private logic，只
   把 discriminator 字段拆解到现有 method。✅ 已完成。
2. **stub 边界**：`opc_reflect_admin` 的 `on_demand / query_stats /
   unlearn_method` 三个 action 已实现（M17.e 落地）。
3. **M17.g (alias 数据)**：`shared/tool-aliases/` 模块已落地，包含
   ALIAS_MAP、resolveAlias()、TOMBSTONES、PROTECTED_ANCHORS。完备性单测通过。
4. **文档全改 (M17.h–k)**：doc/feature/* 下所有工具调用样例、时序图、
   registry-guard 列表已更新为合并后工具名。M25 完成。

## 测试覆盖快照

| Server | 测试覆盖 | 状态 |
|---|---|---|
| PipelineServer | create/status/lifecycle(complete/abort/resume/replan) + remove/modify/reorder + kill_agents + dirty_paths | ✅ 完备 |
| NodeServer | start/finish(completed/failed/retry) + 拒未知 status | ✅ 完备 |
| PhaseServer | start/confirm/complete/reset + V0.9 目录扫描 | ✅ 完备 |
| ReflectionServer | plan/execute(6 methods: cove/critique/debate/tot/reflexion/validator)/complete(6 method)/admin(5 action) | ✅ 完备 |
| CorrectionsServer | crud(query/record/unlearn/reindex/promote) | ✅ 完备 |

## 与 06 章 host-contract 的接口

- M17.b 的 `lifecycle.action=resume` 仍然依赖 06 章 §V6 PoC 证明的
  HTTP/SSE 重连语义；本里程碑只做 facade，真正的 resume-after-orphan
  逻辑留给 M18 observability。
- M17.c 的 `finish.status=retry` 受 §6.5 retry budget 约束，复用现有
  `complete()` 内部 quality-gate 逻辑。
- M17.d 的 `phase_confirm` 是 §4.1 registry-guard 锚点；若现行
  state-server 没显式 confirm 端点（commit 走 git），新方法可能只是
  一个 no-op 状态推进，避免破坏锚点契约。

## 下游同步清单（M17.h–k → M25 已完成）

- `doc/feature/02-opc-state-server/01-intent-analysis/02_03_04_*.md` ✅
- `doc/feature/02-opc-state-server/02-pipeline/09_tools.md` ✅
- `doc/feature/02-opc-state-server/03-phase/04_05_06_08_*.md` ✅
- `doc/feature/02-opc-state-server/04-node/05_07_08_*.md` ✅
- `doc/feature/03-opc-knowledge-server/02-knowledge-api/02_core-tools.md` ✅
- `doc/feature/05-opc-reflection-server/02-server-design/00_overview.md` ✅
- `doc/feature/05-opc-reflection-server/04-reflection-flow/06_call-sequence-contract.md` ✅
- `doc/feature/01-overview/00_index.md` + `03_architecture.md` ✅
- `doc/feature/04-e2e/01-walkthrough/*.md` + `04-e2e/02-test/*.md` ✅
- `platform/mcp/opc-state-server/prompts/01_intent-analysis-overview.md` ✅
