# 02 — 迁移 Checklist（阶段 2 文档全量更新）

> 本章提供 54→24 工具合并后，所有受影响的文档文件的逐文件更新 checklist。
> 按 `00_overview.md` §2.5 阶段 2 的规划执行。每个文件标注修改类型、
> 涉及的工具名替换、依赖关系。

## 一、修改类型

| 标记 | 含义 |
|---|---|
| 🔄 重写 | 整个工具规范表重写（旧名→新名+discriminator） |
| ✏️ 替换 | 批量替换旧工具名为新名 |
| 📋 更新 | 保护清单/豁免清单中的工具名更新 |
| 🗑️ 删除 | 已废弃的工具调用从时序图中移除 |
| ➕ 新增 | 新增内容（如 inline 模式说明） |

## 二、逐文件 Checklist

### 2.1 State-Server Flow 文档

| # | 文件 | 类型 | 变更内容 |
|---|---|---|---|
| F1 | `02-opc-state-server/01-intent-analysis/02_flow-tools-entry-lifecycle.md` | 🔄 | 重写 flow 工具表：14→7。`opc_flow_lifecycle({action:"start"|"abort"|"recover"})` 统一入口 |
| F2 | `02-opc-state-server/01-intent-analysis/03_flow-tools-step-routing.md` | 🔄 | `opc_flow_step_complete` 的 4 个 step 分支用 `oneOf` 表达 |
| F3 | `02-opc-state-server/01-intent-analysis/04_flow-tools-correction.md` | 🔄 | `opc_flow_correct` 吸收 `phase_reset` 分支（`action: "revise"|"restart"|"phase_reset"`） |
| F4 | `02-opc-state-server/01-intent-analysis/01_hook-architecture.md` | ✏️ | Hook 文本中的工具名替换（如引用了旧名） |

### 2.2 State-Server Pipeline 文档

| # | 文件 | 类型 | 变更内容 |
|---|---|---|---|
| F5 | `02-opc-state-server/02-pipeline/09_tools.md` | 🔄 | 重写 pipeline 工具表：6→3。`opc_pipeline_lifecycle({action:"complete"|"abort"|"replan"|"resume"})` |

### 2.3 State-Server Phase 文档

| # | 文件 | 类型 | 变更内容 |
|---|---|---|---|
| F6 | `02-opc-state-server/03-phase/04_phase-start.md` | ✏️ | `opc_phase_start` 不变，但引用 pipeline 生命周期的地方换新名 |
| F7 | `02-opc-state-server/03-phase/05_phase-confirm.md` | ✏️ | `opc_phase_confirm` 不变（锚点），但引用 reflection 工具的地方换新名 |
| F8 | `02-opc-state-server/03-phase/06_phase-complete.md` | ✏️ | `opc_phase_complete` 不变（锚点） |
| F9 | `02-opc-state-server/03-phase/08_tools-and-automation.md` | 🔄 | 重写 phase 工具表：5→3。删除 `opc_phase_adjust` |

### 2.4 State-Server Node 文档

| # | 文件 | 类型 | 变更内容 |
|---|---|---|---|
| F10 | `02-opc-state-server/04-node/07_tools.md` | 🔄 | 重写 node 工具表：4→2。`opc_node_finish({status:"success"|"failed"|"retry"})` |

### 2.5 Knowledge-Server 文档

| # | 文件 | 类型 | 变更内容 |
|---|---|---|---|
| F11 | `03-opc-knowledge-server/02-knowledge-api/02_core-tools.md` | 🔄 | 重写 knowledge 工具表：8→4。`opc_knowledge_read({mode:"single"|"batch"|"list"|"search"|"diff"})`；`opc_knowledge_admin({action:"delete"|"reindex"})` |

### 2.6 Reflection-Server 文档

| # | 文件 | 类型 | 变更内容 |
|---|---|---|---|
| F12 | `05-opc-reflection-server/02-server-design/00_overview.md` §一 | 🔄 | 重写 13 工具表→4 工具：`opc_reflect_plan` / `opc_reflect_execute` / `opc_reflect_complete` / `opc_reflect_admin` |
| F13 | `05-opc-reflection-server/02-server-design/00_overview.md` §五 | ✏️ | Sub-agent `tools` 白名单中的工具名替换 |
| F14 | `05-opc-reflection-server/04-reflection-flow/06_call-sequence-contract.md` | 🔄➕ | 5 步铁律→3 步铁律（inline 模式）；工具名全部替换；registry-guard 保护清单更新 |
| F15 | `05-opc-reflection-server/04-reflection-flow/07_three-server-seam-matrix.md` | ✏️ | 接缝矩阵中的工具名替换 |
| F16 | `05-opc-reflection-server/03-corrections-store/00_overview.md` | ✏️ | corrections 工具引用替换：4→1（`opc_corrections`） |
| F17 | `05-opc-reflection-server/03-corrections-store/05_distiller-agent.md` | ✏️ | distiller prompt 中的工具名替换 |

### 2.7 E2E 文档

| # | 文件 | 类型 | 变更内容 |
|---|---|---|---|
| F18 | `04-e2e/E2E-REGRESSION.md` | ✏️ | 工具调用链中的旧名→新名 |
| F19 | `04-e2e/01-walkthrough/` 下所有时序文档 | ✏️ | mermaid 时序图中的工具名替换 |

### 2.8 跨文档

| # | 范围 | 类型 | 变更内容 |
|---|---|---|---|
| F20 | 所有 mermaid 时序图 | ✏️ | `opc_reflect_<method>` → `opc_reflect_execute({method})` 等 |
| F21 | 所有 registry-guard 保护清单 | 📋 | 旧 (工具名) → 新 (工具名, discriminator) 对（见 `00_overview.md` §4.3） |
| F22 | 所有豁免清单 | 📋 | 旧 (工具名) → 新 (工具名, discriminator) 对（见 `00_overview.md` §4.4） |

## 三、执行顺序

```
Phase 2a — 工具规范文档（重写类）:
    F1 → F2 → F3 → F5 → F9 → F10 → F11 → F12
    这些是"单文件内重写"，不涉及跨文件指针，可并行

Phase 2b — 时序与契约文档（重写+替换类）:
    F14（核心契约文件，最复杂）→ F15 → F4

Phase 2c — 批量替换（纯替换类）:
    F6 → F7 → F8 → F13 → F16 → F17 → F18 → F19 → F20

Phase 2d — 保护清单批量更新:
    F21 → F22
    此步必须在所有引用 registry-guard 的文档更新后执行，确保一致性
```

## 四、每文件验证步骤

完成一个文件后，执行以下验证：

```
① git diff <file> — 人工确认所有工具名替换正确
② grep "opc_reflect_<method>" <file> — 不应再有旧拆分名
③ grep "opc_node_finish.*success\|opc_node_finish.*failed" <file> — 旧 status 二选一名 → 新统一名
④ 检查该文件引用的其他文件路径是否仍有效
```

## 五、全局验证

Phase 2 全部完成后：

```
① grep -r "opc_reflect_cove\|opc_reflect_critique\|opc_reflect_debate\|opc_reflect_tot" doc/ — 应为空
② grep -r "opc_node_success\|opc_node_failed" doc/ — 应为空
③ grep -r "opc_corrections_query\|opc_corrections_upsert\|opc_corrections_record" doc/ — 应为空
④ npx vitest run — 476 tests 应全部通过
```

## 六、风险与回滚

| 风险 | 缓解 |
|---|---|
| 替换脚本误改 | 每次 git commit 一个文件，方便逐个 revert |
| 保护清单不一致 | F21/F22 在 Phase 2d 统一执行 |
| 跨文件指针断裂 | Phase 2c 批量替换运行时用 `grep -l` 交叉验证引用目标存在 |
| 时序图 mermaid 语法破坏 | 每个含 mermaid 的文件手动渲染确认 |

## 七、相关文档

- [00 工具合并总览](./00_overview.md) — 54→24 完整映射表 + 规则
- [01 Discriminator Schema 示例](./01_discriminator-schema-examples.md) — 每个工具的完整 JSON Schema
- [03 Deprecated Alias 规范](./03_deprecated-alias-spec.md) — 旧名 alias 的 server 实现
