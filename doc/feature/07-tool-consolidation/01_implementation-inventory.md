# 01 — 实现盘点：当前 server 方法 vs 目标 28 工具

> 截至 2026-06-10 的代码侧实际状态。用于 M17 后续子任务（b–g 实现 / h–k
> 文档改写）锚定。
>
> **结论**：内部业务逻辑已经走的是合并后的 28 工具模型；缺的是
> discriminator 风格的 facade 层（lifecycle / finish / execute / complete
> / admin / corrections），以及供 M19 MCP wire 层使用的 old→new 别名
> 映射数据。

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
| **opc_pipeline_lifecycle** | — (replan 已存在，complete/abort/resume 未 facade) | ⚠️ 缺 facade | **M17.b** |
| **opc_phase_start** | `PhaseServer.start` | ✅ 已对齐 | — |
| **opc_phase_confirm** | — (注：spec 4.1 列为 registry-guard 锚点) | ⚠️ 缺方法 | **M17.d** |
| **opc_phase_complete** | `PhaseServer.complete` | ✅ 已对齐 | — |
| **opc_node_start** | `NodeServer.start` | ✅ 已对齐 | — |
| **opc_node_finish** | — (现 `complete` 只覆盖 success；failed/retry 未 facade) | ⚠️ 缺 facade | **M17.c** |
| **opc_knowledge_open** | `KnowledgeServer.open` | ✅ 已对齐 | — |
| **opc_knowledge_read** | `KnowledgeServer.read` | ✅ 已对齐（5 mode） | — |
| **opc_knowledge_write** | `KnowledgeServer.write` | ✅ 已对齐（base_version） | — |
| **opc_knowledge_admin** | `KnowledgeServer.admin` | ✅ 已对齐（delete/reindex） | — |
| **opc_reflect_plan** | `ReflectionServer.plan` | ✅ 已对齐 | — |
| **opc_reflect_execute** | — (现 `critique` 仅覆盖 critique method；M3/M5/M6 + inline 未 facade) | ⚠️ 缺 facade | **M17.e** |
| **opc_reflect_complete** | — (现 `critiqueComplete` 仅按 critique 路径；多 method 未 facade) | ⚠️ 缺 facade | **M17.e** |
| **opc_reflect_admin** | — (现 `recordInterventions` 一个方法；explain/query_stats/unlearn 未实现) | ⚠️ 缺 facade + 部分 stub | **M17.e** |
| **opc_corrections** | — (现 `CorrectionsServer.query` + `upsert`；统一 dispatch 未 facade) | ⚠️ 缺 facade | **M17.f** |

## 关键判断

1. **业务逻辑保留**：所有 facade 都不动 underlying private logic，只
   把 discriminator 字段拆解到现有 method。
2. **stub 边界**：`opc_reflect_admin` 的 `on_demand / query_stats /
   unlearn_method` 三个 action 现阶段无实现也无契约消费方；M17.e 落地
   facade + 抛 `NotImplemented` 即可，等 M18 / M19 真正用到再补。
3. **M17.g (alias 数据)**：M19 MCP wire 层（`platform/mcp/*/src/index.ts`
   未来要补的 stdio/http 框架）会用本表把 old name → (new tool, discriminator)
   翻译。本子任务先把数据落到 `shared/tool-aliases/` 一个纯 ts 模块 +
   完备性单测，wire 层接入推到 M19。
4. **文档全改 (M17.h–k)**：内部 method 名 OK，但所有 doc/feature/* 子
   章节里的工具调用样例 / 时序图 / registry-guard 列表 / 异常文案仍是
   旧名。改写量大，分 4 个 commit 走。

## 测试覆盖快照（仅核对 facade 层后续要补什么）

| Server | 现有测试 | M17 期望新增 |
|---|---|---|
| PipelineServer | create/status/replan | lifecycle(complete/abort/resume) 4 分支 |
| NodeServer | complete(success only) | finish(failed/retry) 2 分支 + 拒未知 status |
| PhaseServer | start/complete/reset | confirm 路径（如新增） |
| ReflectionServer | plan/critique/critiqueComplete | execute(M3/M4/M5/M6) + complete(4 method) + admin(record_interventions 已有 / 其它 stub) |
| CorrectionsServer | query/upsert | dispatch(query/record/unlearn/reindex) |

## 与 06 章 host-contract 的接口

- M17.b 的 `lifecycle.action=resume` 仍然依赖 06 章 §V6 PoC 证明的
  HTTP/SSE 重连语义；本里程碑只做 facade，真正的 resume-after-orphan
  逻辑留给 M18 observability。
- M17.c 的 `finish.status=retry` 受 §6.5 retry budget 约束，复用现有
  `complete()` 内部 quality-gate 逻辑。
- M17.d 的 `phase_confirm` 是 §4.1 registry-guard 锚点；若现行
  state-server 没显式 confirm 端点（commit 走 git），新方法可能只是
  一个 no-op 状态推进，避免破坏锚点契约。

## 下游同步清单

完成 M17.b–g 后，触发以下文档同步（M17.h–k）：

- `doc/feature/02-opc-state-server/01-intent-analysis/02_03_04_*.md`
- `doc/feature/02-opc-state-server/02-pipeline/09_tools.md`
- `doc/feature/02-opc-state-server/03-phase/04_05_06_08_*.md`
- `doc/feature/02-opc-state-server/04-node/05_07_08_*.md`
- `doc/feature/03-opc-knowledge-server/02-knowledge-api/02_core-tools.md`
- `doc/feature/05-opc-reflection-server/02-server-design/00_overview.md`
- `doc/feature/05-opc-reflection-server/04-reflection-flow/06_call-sequence-contract.md`（registry-guard 列表 + 5 步 → 3 步 inline）
- `doc/feature/01-overview/00_index.md` + `03_architecture.md`
- `doc/feature/04-e2e/01-walkthrough/*.md` + `04-e2e/02-test/*.md`
