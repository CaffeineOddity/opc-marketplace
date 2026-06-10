# 07 三 server 接缝矩阵（Reflection × State × Knowledge）

> 本文档是 [反思流程总览](00_overview.md) 的姊妹篇，专门把 P1–P8 八个反思位点在三个 MCP server 之间的**触发器 / evidence 来源 / 反思方法 / ack 发起方 / ack 消费方 / 持久化位置 / 失败降级 / 知识接缝**梳理成一张"接缝矩阵"。原本这些信息散落在以下 4 篇互相引用的文档里：
>
> - [`02-opc-state-server/01-intent-analysis/03_flow-tools-step-routing.md`](../../02-opc-state-server/01-intent-analysis/03_flow-tools-step-routing.md) — `opc_flow_reflect` 入参与路由
> - [`02-opc-state-server/01-intent-analysis/10_flow-state-schema.md`](../../02-opc-state-server/01-intent-analysis/10_flow-state-schema.md) — `flow-state.json.pending_reflections` 与 `reflection_log`
> - [`05-opc-reflection-server/01-method-theory/00_overview.md 五`](../01-method-theory/00_overview.md#五step--方法-选择决策表primary--secondary) — primary / secondary 决策表
> - [`05-opc-reflection-server/04-reflection-flow/06_call-sequence-contract.md`](06_call-sequence-contract.md) — 单驱动者契约 + reflection-registry-guard + 命名约定 + 不变量
>
> 本文档**只做整合与边界穷举**，不重复方法学定义与契约规则。任何与本表冲突的旧文档表述以本表为准。

---

## 一、术语与字段约定

| 术语 | 含义 |
|---|---|
| **触发器** | 哪个 state-server 工具的路由分支负责把流程引到反思 |
| **Evidence artifact** | Claude 提交的 `*_evidence` 对象（详见 [02-server-design 二](../02-server-design/00_overview.md#二evidence-schema)） |
| **Validator** | 在 evidence 进入反思前跑的 V1–V5 + meta-validator |
| **Primary 方法 / Secondary 方法** | 反思 sub-agent 用的方法标签（M2/M3/M4/M5/M6） |
| **Pending 发起方** | `opc_reflect_complete({method})` 工具，写盘 artifact 并返回 `pending_reflection {reflection_id, artifact_path}` |
| **Pending 登记方** | `opc_flow_reflect`（state-server 唯一登记口） |
| **持久化位置** | artifact 物理文件路径（reflection-server 写）+ `flow-state.reflection_log[]` 登记指针（state-server 写） |
| **Knowledge 接缝** | 反思过程中 sub-agent 是否需要读 knowledge-server，以及对 `_refs` / `version` 的依赖 |
| **失败降级** | 反思器自身失败时的兜底（meta-validator reject / rounds 耗尽 → ask_user / sub-agent 超时 / RS 不可达） |

---

## 二、主矩阵（P1–P8）

> 列宽较多，建议在编辑器宽屏查看；如果在窄屏阅读，可参照 [三、按维度纵向汇总](#三按维度纵向汇总) 的几张专项小表。

| # | 位点 | 触发工具（state-server）| Evidence artifact 类型 | Validator | Primary | Secondary | 反思 sub-agent 权限 | Ack 发起方（reflection-server）| Ack 消费方（state-server）| 持久化位置 | Knowledge 接缝 | 失败降级 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **P1** | 意图分类 | `opc_flow_step_complete({step:"intent_analysis"})`（路由分支：`intent=task` 且 V1-V5 fail / 严重 objection）| `intent_evidence`（`task_criteria_hits[]` / `chat_signals[]` / `user_quotes[]`）| V1 schema + V3 evidence-presence + V5 discrimination | **M3 CoVe** | M4 Critique | 只读：`opc_corrections({action:"query"})`、`Read`、`Grep` | `opc_reflect_complete({method:"cove"})` → `opc_reflect_complete({method:"critique"})` | `opc_flow_reflect`（`step_id="intent_analysis"`，无 `pipeline_pointer_ref`）| `flow-state.json.reflection_log[]`，`accumulated.intent_evidence_ref` 指向 `opc-logs/reflection/<session_id>/P1.jsonl#L<n>` | 无（意图阶段尚未涉及 unit）| 任何方法 reject → `validator-only + ask_user`；用户裁定后写 `flow-state.user_interventions[]` |
| **P2** | 任务分析 | `opc_flow_step_complete({step:"task_analysis"})`（路由分支：V1-V5 fail / 严重 objection）| `task_analysis_evidence`（`requirements[]` / `dependencies[]` / `risks[]` / `knowledge_plan` / `phase_selection_rationale` / `complexity_signals`）| V1 + V2 referential（`knowledge_plan.path` 存在性）+ V3 + V4 coverage + 兜底 1 coverage-guard | **M3 CoVe** | M2 Reflexion（注入 corrections）| 同 P1 + `opc_knowledge_read({mode:"list"})`（只读拓扑结构）| `opc_reflect_complete({method:"cove"})` → `opc_reflect_complete({method:<secondary>})` | `opc_flow_reflect`（`step_id="task_analysis"`） | `flow-state.json.reflection_log[]`，`accumulated.analysis_evidence_ref` → `opc-logs/reflection/<session_id>/P2.jsonl` | sub-agent 调 `opc_knowledge_read({mode:"list"})` 校对 `knowledge_plan.path` 的 unit/section/sub 是否已存在；**不读 .md 内容**（节省 token）| 同 P1；complexity 升级时改写 `accumulated.analysis_result.complexity` 后回到 task_analysis 重做 |
| **P3** | 任务拆分 | `opc_flow_step_complete({step:"task_decomposition"})`（路由分支：V1-V5 fail / 严重 objection）| `decomposition_evidence`（`boundary_rationale[]` / `dependency_graph` / `unit_isolation_check[]`）| V1 + V2 referential（unit / `blocked_by` sub_id 存在性）+ V3 + V5 discrimination（避免"全候选都过"）| **M6 ToT** | M5 Debate（complexity ≥ medium 启用）| 同 P2 + `opc_knowledge_read({mode:"single"})`（只读已有 unit 的 `_refs` 字段，**不读全文**）| `opc_reflect_complete({method:"tot"})` → `opc_reflect_complete({method:"debate"})` | `opc_flow_reflect`（`step_id="task_decomposition"`） | `flow-state.json.reflection_log[]`，`accumulated.decomposition_evidence_ref` → `opc-logs/reflection/<session_id>/P3.jsonl` | sub-agent 读 `opc-knowledge/.opc-knowledge.json` 校对跨 unit `_refs` 与拟拆分边界一致性；ToT 分支提议合并 / 拆分时引用 `_refs` 作为依据 | rounds 耗尽 → 降级到 primary-only；若 primary 也失败 → `ask_user` 让用户确认拆分方案 |
| **P4** | Brief 生成 | `opc_flow_step_complete({step:"brief_generation"})`（路由分支：V4 coverage 不足；默认不强制反思）| `brief_evidence`（`brief_to_task_mapping[]` / `coverage_score`）| V1 + V4 coverage（brief 章节 → P2/P3 evidence 字段映射覆盖率）| **M3 CoVe**（轻量，默认 budget 1 轮）| M4 Critique（仅当 coverage < 阈值时启用）| 同 P1 | `opc_reflect_complete({method:"cove"})` → `opc_reflect_complete({method:"critique"})` | `opc_flow_reflect`（`step_id="brief_generation"`） | `flow-state.json.reflection_log[]`，`accumulated.brief_evidence_ref` → `opc-logs/reflection/<session_id>/P4.jsonl` | 无（brief 是 P2/P3 evidence 的汇编，不直接读 knowledge）| 默认 1 轮过即过；FP 时降级 `intensity=off`，brief 跳过反思直接进入 `opc_pipeline_create` |
| **P5** | 节点选择 | `opc_phase_start` 后、`opc_phase_confirm` 前（路由分支：V1-V5 fail / 严重 objection）| `selection_evidence`（`matched_tags` / `scenario_hits` / `file_domain_conflicts` / `blocked_by_graph`）| V1 + V2 referential（node 名存在 + `blocked_by` 节点存在）+ V3 + V5 + 兜底 1 | **M4 Critique** | M5 Debate（complexity ≥ medium 启用）| 同 P3 + `opc_knowledge_read({mode:"batch"})`（只读节点声明的 `input.knowledge` 当前 version，校对 `min_version`）| `opc_reflect_complete({method:"critique"})` → `opc_reflect_complete({method:"debate"})` | `opc_flow_reflect`（`step_id="node_selection"`，**必须**带 `pipeline_pointer_ref: {pipeline_id, sub_pipeline_id, phase}`） | 主存储：`state.json.phases[].reflection_log[]`；指针：`flow-state.json.reflection_log[]` 加 `{pipeline_pointer_ref, log_entry_id}` | sub-agent 读各候选节点 `frontmatter.input.knowledge[].min_version`，与 `opc-knowledge/<unit>/<section>/<sub>.md` 实际 `frontmatter.version` 比对，作为 `selection_evidence.blocked_by_graph` 的硬约束依据 | 同 P3；用户裁定后改写 `state.json.phases[].selected_nodes` 并写 `flow-state.user_interventions[]` |
| **P6** | 节点执行 | `opc_node_finish({status:"success"})`（默认走 Validator-only；evidence 存疑时升级反思）| `node_evidence`（`artifacts[]` / `test_results` / `lint_results` / `build_output` / `files_created` / `knowledge_written`）| **Validator 为主**（L1 产出物存在性 + L2 quality_gates）+ V3 evidence-presence + 兜底 3 freshness | **(internal V1-V5)** — state-manager 内部跑，**不走 reflection 工具面**（[02-server-design 三·补](../02-server-design/00_overview.md#三补-p6--p7-不走-reflection-工具面边界澄清)） | M4 Critique（仅在 L2 通过但 Claude 主动调 `opc_reflect_execute` 升级时启用）| 若启用 critique：只读 `Read`、`Grep`、`opc_knowledge_read({mode:"single"})` | （Validator-only 时无 ack）若启用 critique：`opc_reflect_complete({method:"critique"})` | `opc_flow_reflect`（`step_id="node_execution"`，带 `pipeline_pointer_ref` 含 `node`） | 主存储：`state.json.phases[].nodes[].reflection_log[]`；指针：`flow-state.json.reflection_log[]` | sub-agent 读 sub-agent 已写入的 `knowledge_written[]` 路径，验证 `version+1` 是否落盘、`updated_at` 是否新于 node `started_at`；不调 `opc_knowledge_write` | L1 fail → `opc_node_finish({status:"failed"})` → retry；L2 fail → 同上；critique fail → 仅写 warning，不阻塞 `unblocked_nodes` 推进 |
| **P7** | 阶段完成 | `opc_phase_complete`（默认走 Validator-only）| `phase_evidence`（`quality_gate_results[]` / `node_completion_map`）| **Validator 为主**（聚合本 phase 所有 node 的 L1/L2）+ V3 + 兜底 1 | **(internal V1-V5)** — state-manager 内部跑，**不走 reflection 工具面**（[02-server-design 三·补](../02-server-design/00_overview.md#三补-p6--p7-不走-reflection-工具面边界澄清)） | M3 CoVe（仅在 quality_gate 自动跑失败次数 ≥ 阈值时启用，逐条断言核对）| 同 P6 | （Validator-only 时无 ack）若启用 CoVe：`opc_reflect_complete({method:"cove"})` | `opc_flow_reflect`（`step_id="phase_completion"`，带 `pipeline_pointer_ref`） | 主存储：`state.json.phases[].phase_reflection_log[]`；指针：`flow-state.json.reflection_log[]` | sub-agent 读所有本 phase node 的 `output.knowledge` 路径，校验 frontmatter 完整性与 `_refs` 是否被正确更新；不写 | Validator fail → reject `opc_phase_complete` 调用，要求 Claude 调 `opc_node_finish({status:"retry"})` 或 `opc_flow_correct({action:"phase_reset"})`；CoVe fail → warning，仍允许推进 |
| **P8** | 阶段推进 / 回退 | `opc_phase_complete` 内部 auto_advance 4 条件判定（V1-V5 fail → 阻止自动推进）；或用户提议 `opc_flow_correct({action:"phase_reset"})` 时 | `advance_evidence`（`auto_advance_4_conditions` 各条目命中情况 / `unblocked_phases[]` / `regression_signals[]`）| V1 + V3 + V4 coverage（auto_advance 4 条件全覆盖） | **M4 Critique** | M5 Debate（复杂度 ≥ medium 且决策方向为"回退"时启用） | 同 P5 + 可调 `opc_corrections({action:"query"})`（查"回退决策"类历史教训）| `opc_reflect_complete({method:"critique"})` → `opc_reflect_complete({method:"debate"})` | `opc_flow_reflect`（`step_id="phase_advance"`，带 `pipeline_pointer_ref`） | 主存储：`state.json.phases[].advance_reflection_log[]`；指针：`flow-state.json.reflection_log[]` | sub-agent 读下一 phase 在 `phase_plan.selected` 中的位置、读 `_refs` 跨 phase 依赖；回退场景额外读 `state.json.snapshots[]` 元数据 | Validator fail → 强制 `auto_advance=false`，由 Claude / 用户决定；Debate 双方立场重合 → meta-validator reject，降级 Critique-only |

---

## 三、按维度纵向汇总

### 3.1 `step_id` 枚举与持久化位置（解决 schema 散落问题）

> 取代 [03_flow-tools-step-routing.md opc_flow_reflect](../../02-opc-state-server/01-intent-analysis/03_flow-tools-step-routing.md#opc_flow_reflect) 入参里的 `'task_analysis' | 'node_selection' | ...` 省略号；本表是 `step_id` 的**完整枚举**。

| `step_id` 值 | 对应位点 | `pipeline_pointer_ref` 是否必填 | artifact + 登记主存储 | `flow-state.json` 二级指针 |
|---|---|---|---|---|
| `"intent_analysis"` | P1 | ❌ 不需要（pipeline 未创建） | `flow-state.json.reflection_log[]` | 主存储即此处 |
| `"task_analysis"` | P2 | ❌ 不需要 | `flow-state.json.reflection_log[]` | 同上 |
| `"task_decomposition"` | P3 | ❌ 不需要 | `flow-state.json.reflection_log[]` | 同上 |
| `"brief_generation"` | P4 | ❌ 不需要 | `flow-state.json.reflection_log[]` | 同上 |
| `"node_selection"` | P5 | ✅ 必填 `{pipeline_id, sub_pipeline_id, phase}` | `state.json.phases[<phase>].reflection_log[]` | 加 `{pipeline_pointer_ref, log_entry_id}` |
| `"node_execution"` | P6 | ✅ 必填 `{pipeline_id, sub_pipeline_id, phase, node}` | `state.json.phases[<phase>].nodes[<node>].reflection_log[]` | 同上（含 `node` 字段） |
| `"phase_completion"` | P7 | ✅ 必填 `{pipeline_id, sub_pipeline_id, phase}` | `state.json.phases[<phase>].phase_reflection_log[]` | 同上 |
| `"phase_advance"` | P8 | ✅ 必填 `{pipeline_id, sub_pipeline_id, phase}` | `state.json.phases[<phase>].advance_reflection_log[]` | 同上 |

> **schema 升级要点**：
> - `flow-state.json.pending_reflections[].pipeline_pointer_ref` 是可选字段（P1–P4 时为 `null`），与 [10_flow-state-schema.md `pending_reflections 说明`](../../02-opc-state-server/01-intent-analysis/10_flow-state-schema.md#) 当前示例（含 `pipeline_pointer_ref`）保持向后兼容。
> - `opc_flow_reflect.step_id` 枚举从原本的 `'task_analysis' | 'node_selection' | ...` 扩展为上表 8 个完整值；省略号正式去除。

### 3.2 Pending 登记保护工具清单

> 已整合到 [06_call-sequence-contract.md 七 防御 3 受 reflection-registry-guard 保护的工具清单](06_call-sequence-contract.md#受-reflection-registry-guard-保护的工具清单唯一真相源)，作为单一真相源维护。本节不再重复列举（避免清单漂移）；如需查 P1–P8 每个位点的拦截工具与 `required_action`，直接读 06 的清单。

### 3.3 Knowledge 接缝汇总（哪个 step 怎么用 knowledge-server）

| Step | 读 | 写 | 关键调用 |
|---|---|---|---|
| P1 | — | — | 无 |
| P2 | ✅ 只读拓扑 | — | `opc_knowledge_read({mode:"list"})` |
| P3 | ✅ 读 `_refs` 元数据 | — | `opc_knowledge_read({mode:"single"})`（仅 `_refs` 字段，不全文）|
| P4 | — | — | 无（汇编上游 evidence） |
| P5 | ✅ 读 `min_version` | — | `opc_knowledge_read({mode:"batch"})`（节点声明的 input） |
| P6 | ✅ 读 sub-agent 已写内容 | — | `opc_knowledge_read({mode:"single"})`（验证版本递增） |
| P7 | ✅ 读 phase 所有 output | — | `opc_knowledge_read({mode:"batch"})` + 校 `_refs` |
| P8 | ✅ 读 `_refs` 跨 phase 依赖 | — | `opc_knowledge_read({mode:"single"})`（元数据） |

> **核心约束**：**所有反思 sub-agent 严禁调 `opc_knowledge_write` / `opc_knowledge_admin({action:"delete"})`**。这与 [02-server-design 五 Sub-Agent 权限白名单](../02-server-design/00_overview.md#五sub-agent-权限白名单) 一致——反思只能"看"不能"改"，避免 critic 越界改文件。

### 3.4 失败降级链（统一形态）

每个位点的兜底链路按强度递增：

```
Primary 方法 fail / meta-validator reject
  ↓
Secondary 方法（如启用）
  ↓
Validator-only（删 sub-agent，仅跑 V1-V5 + 三兜底）
  ↓
ask_user（附 reasoning_trace + evidence diff）
  ↓
用户裁定 → opc_flow_user_reply（state-server ask_user 触发后） / opc_flow_correct({action:"revise"|"restart"|"phase_reset"})（用户主动）
  ↓
写 flow-state.user_interventions[] (L1)
  ↓ pipeline_complete 时
distiller → opc-memory/corrections/ (L2)
  ↓ 用户晋升
~/.opc/global-corrections.jsonl (L3)
```

> **A3 闭环说明**：当反思 rounds_exceeded 触发时走的是 `opc_flow_user_reply` 路径（state-server 主动写 `pending_user_question`，用户答复后回灌）；用户主动纠错走 `opc_flow_correct({action:"revise"|"restart"|"phase_reset"})`。两类写入的 `user_interventions[]` 条目用 `trigger` 字段区分，distiller 优先处理 A3 条目。完整契约见 [06_call-sequence-contract.md 八·补 ask_user 回灌闭环](06_call-sequence-contract.md#八补-ask_user-回灌闭环a3-契约)。

> **特殊位点的降级例外**：
> - **P6 critique fail**：仅写 warning，不阻塞 `unblocked_nodes` 推进（反思失败不能卡 Validator-only 的 happy path）。
> - **P7 CoVe fail**：仅写 warning，仍允许 `opc_phase_complete` 推进。
> - **P4 反思失败**：直接降级 `intensity=off` 跳过 brief 反思（brief 是汇编层，不值得多轮反思）。

### 3.5 拆分管线下的反思轮次

> 串行执行下同一时刻只有一条 sub 在运行，反思 sub-agent 不会跨 sub 并发；轮次上限按串行场景设定。

**唯一约束 = 轮次上限**（`max_rounds`）。**已删除 token 累计预算**——反思死循环防护改由轮次单一指标兜底，token 不再追踪。

| 配置项 | 范围 | 默认值 | 超限行为 |
|---|---|---|---|
| `max_rounds` | 单个反思位点 | 2（P1/P2/P4/P5/P6/P7）/ 3（P3/P8） | 反思 `verdict: rounds_exceeded` → `flow_next: ask_user` |
| **轮次配置覆盖** | 按 phase + complexity 细化 | 见 [02-opc-state-server/03-phase/02_node-selection.md 四](../../02-opc-state-server/03-phase/02_node-selection.md#四反思-rounds-guard-上限按-phase--complexity-配置) | 同上 |

> **观测**：rounds-guard 触发事件写入 `opc-logs/reflection/<pipeline-id>/rounds-events.jsonl`，pipeline manifest 末尾汇总 "反思轮数 / ask_user 次数 / 触发位点"。

---

## 四、契约一致性约束（与既有文档对齐）

| 既有文档 | 既有表述 | 本表对齐方式 |
|---|---|---|
| `01-intent-analysis/03_flow-tools-step-routing.md` opc_flow_reflect 入参 `step_id` | `'task_analysis' \| 'node_selection' \| ...` | 本表 [3.1](#31-step_id-枚举与持久化位置解决-schema-散落问题) 给出完整 8 项枚举 |
| `01-intent-analysis/10_flow-state-schema.md` `pending_reflections[].pipeline_pointer_ref` | 示例含 pipeline_pointer_ref，类型未声明 optional | 本表 [3.1](#31-step_id-枚举与持久化位置解决-schema-散落问题) 注明 P1–P4 时该字段为 `null` |
| `06_call-sequence-contract.md` 受保护工具清单（5 个） | flow_reflect / phase_confirm / phase_complete / node_start / pipeline_complete | 本表 [3.2](#32-ack-受保护工具的扩展含-p1p4-新增项) 扩展到 P1–P4 阶段相关工具，明确 P1–P4 拦截点 |
| `01-method-theory/00_overview.md 五` step → 方法决策表 | 给出 P1–P8 的 primary/secondary | 本表 [二、主矩阵](#二主矩阵p1p8) 与之**完全一致**（本表为副本 + 接缝信息） |
| `02-server-design/00_overview.md 五` sub-agent 权限白名单 | 列出 critic/debater/ToT/distiller/meta 的 allowed_tools | 本表 [3.3](#33-knowledge-接缝汇总哪个-step-怎么用-knowledge-server) 按 step 细化每个位点 sub-agent 实际会调的 knowledge 工具 |
| `04-reflection-flow/00_overview.md 五` phase_reset 与反思状态 | "反思状态只追加不回滚" | 本表 [3.4](#34-失败降级链统一形态) 升级链与之一致；P5/P6/P7/P8 主存储在 state.json，受 phase_reset 影响时按 `superseded=true` 标记而非删除 |

---

## 五、读这张表的两种姿势

**实施者视角**：想知道"我新加一个工具 / 改一个 schema 时要保证什么不变"——查 [二、主矩阵](#二主矩阵p1p8) 对应位点的整行，再读 [3.2](#32-ack-受保护工具的扩展含-p1p4-新增项) 的拦截点与 [3.4](#34-失败降级链统一形态) 的降级链。

**调试者视角**：用户报"反思死循环 / ack 死锁 / 知识冲突" → 先看 [3.1](#31-step_id-枚举与持久化位置解决-schema-散落问题) 定位 step_id → 翻 [二](#二主矩阵p1p8) 看持久化位置 → 读对应 JSON 排错。

---

## 六、相关文档

- [00_overview.md](00_overview.md) — per-step 反思链路总览
- [06_call-sequence-contract.md](06_call-sequence-contract.md) — 单驱动者契约 + reflection-registry-guard 三层防御 + 命名 + 不变量
- [../01-method-theory/00_overview.md](../01-method-theory/00_overview.md) — 5 种反思方法与 step → 方法决策表
- [../02-server-design/00_overview.md](../02-server-design/00_overview.md) — 13 个工具签名 + evidence schema + sub-agent 权限
- [../03-corrections-store/00_overview.md](../03-corrections-store/00_overview.md) — L1/L2/L3 三层归档
- [../../02-opc-state-server/01-intent-analysis/03_flow-tools-step-routing.md](../../02-opc-state-server/01-intent-analysis/03_flow-tools-step-routing.md) — `opc_flow_reflect` 规范
- [../../02-opc-state-server/01-intent-analysis/10_flow-state-schema.md](../../02-opc-state-server/01-intent-analysis/10_flow-state-schema.md) — `pending_reflections` / `reflection_log` 字段
