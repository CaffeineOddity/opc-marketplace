# 07 工具合并规范（54 → 28 工具裁剪）

> 本章定义把 OPC 三个 MCP server 现有 **~54 个工具** 压缩到 **28 个** 的方案：合并语义相近的工具、用 `method` / `action` 入参做分流（discriminator 模式）、保留所有现有能力。
>
> **核心立场**：MCP 工具数膨胀会污染 Claude 的工具列表（每个工具的 schema + description 占 system prompt token），影响选择质量。我们用 discriminator 把"同类不同方法"折叠到一个工具里。

---

## 一、需求

### 1.1 现状盘点

| 模块 | 工具数 | 来源 |
|---|---|---|
| state-server flow（入口/生命周期/步骤路由/纠错） | 14 | `01-intent-analysis/02_03_04_*.md` |
| state-server pipeline | 6 | `02-pipeline/09_tools.md` |
| state-server phase | 5 | `03-phase/08_tools-and-automation.md` |
| state-server node | 4 | `04-node/07_tools.md` |
| knowledge-server | 8 | `03-opc-knowledge-server/02-knowledge-api/02_core-tools.md` |
| reflection-server 主链路 | 13 | `05-opc-reflection-server/02-server-design/00_overview.md 一` |
| reflection-server corrections | 4 | 同上 |
| **合计** | **54** | — |

### 1.2 问题

| 问题 | 影响 |
|---|---|
| 每个工具的 JSON schema + description 平均 ~300 token，54 工具 ≈ **16k token system prompt 占用** | 直接吃掉 Claude long context 预算 |
| 工具名互相相似（`opc_reflect_execute({method:"cove"})` / `opc_reflect_execute({method:"critique"})` / `opc_reflect_execute({method:"debate"})` / `opc_reflect_execute({method:"tot"})`），Claude 选择时易混淆 | 错调成本高，反思链路里 5 步铁律中任意一步走错都要回滚 |
| `opc_node_finish({status:"success"})` / `opc_node_finish({status:"failed"})` 这种"成功/失败二选一"语义被拆成两个工具 | 不符合 finish-result 模式，调用者需要先判断结果再选工具 |
| corrections CRUD 4 个工具独立列出 | CRUD 类操作天然适合用 `action` 入参分流 |

### 1.3 目标

| # | 目标 | 度量 |
|---|---|---|
| G1 | 工具总数 ≤ 30 | 当前裁剪结果 28，达标 |
| G2 | 不丢失任何现有能力 | 每条裁剪映射可回溯到原工具 |
| G3 | Discriminator 字段命名统一（`method` / `action` / `op`） | 见 2.3 命名约定 |
| G4 | 工具描述不超过 300 字符 | system prompt 总占用降到 ~9k token |
| G5 | 反思链路 5 步铁律的工具数从 6 步压到 ≤ 3 步 | 见 2.4 内联模式 |

### 1.4 非目标

- **不**改变任何工具的核心语义（input/output 字段不动，只是入口收敛）
- **不**强行合并语义不同的工具（如 `opc_flow_lifecycle({action:"start"})` 和 `opc_flow_lifecycle({action:"abort"})` 是生命周期对立面，不合并）
- **不**破坏 reflection-registry-guard 等工程契约的工具名锚点（保护清单里出现的工具名必须保持稳定，详见 4.3）

---

## 二、方案

### 2.1 合并映射表（54 → 28）

#### state-server flow（14 → 7）

| 旧工具 | 新工具 | discriminator |
|---|---|---|
| `opc_flow_query` | `opc_flow_query` | —（保留）|
| `opc_flow_lifecycle({action:"start"})` | `opc_flow_lifecycle` | `action: "start"` |
| `opc_flow_lifecycle({action:"abort"})` | `opc_flow_lifecycle` | `action: "abort"` |
| `opc_flow_lifecycle({action:"recover"})` | `opc_flow_lifecycle` | `action: "recover"` |
| `opc_flow_step_complete({step:"intent_analysis"})` | `opc_flow_step_complete` | `step: "intent_analysis"` |
| `opc_flow_step_complete({step:"task_analysis"})` | `opc_flow_step_complete` | `step: "task_analysis"` |
| `opc_flow_step_complete({step:"task_decomposition"})` | `opc_flow_step_complete` | `step: "task_decomposition"` |
| `opc_flow_step_complete({step:"brief_generation"})` | `opc_flow_step_complete` | `step: "brief_generation"` |
| `opc_flow_reflect` | `opc_flow_reflect` | —（保留，是反思登记口锚点，详见 4.3）|
| `opc_flow_user_reply` | `opc_flow_user_reply` | —（保留，是 A3 闭环锚点）|
| `opc_quick_dispatch` | `opc_quick_dispatch` | —（保留，low 通道独立语义）|
| `opc_flow_correct({action:"revise"})` | `opc_flow_correct` | `action: "revise"` |
| `opc_flow_correct({action:"restart"})` | `opc_flow_correct` | `action: "restart"` |
| —（新增）| `opc_flow_correct` | `action: "phase_reset"`（吸收 `opc_flow_correct({action:"phase_reset"})`，见 phase 节）|

**新工具列表（7 个）**：
1. `opc_flow_query`
2. `opc_flow_lifecycle`（start/abort/recover）
3. `opc_flow_step_complete`（intent/task_analysis/decomposition/brief）
4. `opc_flow_reflect`
5. `opc_flow_user_reply`
6. `opc_quick_dispatch`
7. `opc_flow_correct`（revise/restart/phase_reset）

#### state-server pipeline（7 → 3）

| 旧工具 | 新工具 | discriminator |
|---|---|---|
| `opc_pipeline_create` | `opc_pipeline_create` | —（保留，写入语义独立）|
| `opc_pipeline_status` | `opc_pipeline_status` | —（保留，只读独立）|
| `opc_flow_lifecycle({action:"recover"})` | `opc_flow_lifecycle` | 已被吸收（`action: "recover"` 内部级联）|
| `opc_pipeline_lifecycle({action:"complete"})` | `opc_pipeline_lifecycle` | `action: "complete"` |
| `opc_pipeline_lifecycle({action:"abort"})` | `opc_pipeline_lifecycle` | `action: "abort"` |
| `opc_pipeline_lifecycle({action:"replan"})` | `opc_pipeline_lifecycle` | `action: "replan"` |
| `opc_pipeline_lifecycle({action:"resume"})` | `opc_pipeline_lifecycle` | `action: "resume"`（多数场景由 state-manager 在 node 边界自动触发）|

**新工具列表（3 个）**：
1. `opc_pipeline_create`
2. `opc_pipeline_status`
3. `opc_pipeline_lifecycle`（complete/abort/replan/resume）

#### state-server phase（5 → 3）

| 旧工具 | 新工具 | discriminator |
|---|---|---|
| `opc_phase_start` | `opc_phase_start` | —（保留）|
| `opc_phase_adjust` | **删除**（被反思循环替代，详见 `03-phase/04_phase-start.md:182` 说"大部分调整由反思循环自行完成"）| — |
| `opc_phase_confirm` | `opc_phase_confirm` | —（保留，registry-guard 锚点）|
| `opc_phase_complete` | `opc_phase_complete` | —（保留，registry-guard 锚点）|
| `opc_flow_correct({action:"phase_reset"})` | `opc_flow_correct` | 已被吸收（`action: "phase_reset"`）|

**新工具列表（3 个）**：
1. `opc_phase_start`
2. `opc_phase_confirm`
3. `opc_phase_complete`

#### state-server node（4 → 2）

| 旧工具 | 新工具 | discriminator |
|---|---|---|
| `opc_node_start` | `opc_node_start` | —（保留，registry-guard 锚点）|
| `opc_node_finish({status:"success"})` | `opc_node_finish` | `status: "success"` + `evidence` |
| `opc_node_finish({status:"failed"})` | `opc_node_finish` | `status: "failed"` + `error` |
| `opc_node_finish({status:"retry"})` | `opc_node_finish` | `status: "retry"` + `reset_retry_count?` |

**新工具列表（2 个）**：
1. `opc_node_start`
2. `opc_node_finish`（success/failed/retry）

#### knowledge-server（8 → 5）

| 旧工具 | 新工具 | discriminator |
|---|---|---|
| `opc_knowledge_open` | `opc_knowledge_open` | —（保留，初始化语义独立）|
| `opc_knowledge_read({mode:"single"})` | `opc_knowledge_read` | `mode: "single"` |
| `opc_knowledge_read({mode:"batch"})` | `opc_knowledge_read` | `mode: "batch"` |
| `opc_knowledge_read({mode:"list"})` | `opc_knowledge_read` | `mode: "list"` |
| `opc_knowledge_read({mode:"search"})` | `opc_knowledge_read` | `mode: "search"` |
| —（新增） | `opc_knowledge_read` | `mode: "diff"`（3-way diff 预演，详见 [knowledge-api § 2.10](../03-opc-knowledge-server/02-knowledge-api/02_core-tools.md#210-版本冲突与-3-way-diff-and-merge-契约)）|
| `opc_knowledge_write` | `opc_knowledge_write` | —（保留，含 `refs?: string[]` 参数支持 _refs 写入；新增 `base_version?: number` 触发 3-way diff-and-merge，返回 `merge_status`）|
| `opc_knowledge_admin({action:"delete"})` | `opc_knowledge_admin` | `action: "delete"`（可传 `base_version`，不一致则 reject，不走 merge）|
| `opc_knowledge_admin({action:"reindex"})` | `opc_knowledge_admin` | `action: "reindex"` |

**新工具列表（5 个）**：
1. `opc_knowledge_open`
2. `opc_knowledge_read`（single/batch/list/search/**diff**）
3. `opc_knowledge_write`（含 `base_version` + `merge_status`）
4. `opc_knowledge_admin`（delete/reindex）
5. —（4 个对外足够；如未来加 import/export 用 admin 吸收）

#### reflection-server 主链路（13 → 5）

| 旧工具 | 新工具 | discriminator |
|---|---|---|
| `opc_reflect_plan` | `opc_reflect_plan` | —（保留）|
| `opc_reflect_execute({method:"cove"})` | `opc_reflect_execute` | `method: "M3-cove"` |
| `opc_reflect_execute({method:"critique"})` | `opc_reflect_execute` | `method: "M4-critique"` |
| `opc_reflect_execute({method:"debate"})` | `opc_reflect_execute` | `method: "M5-debate"` |
| `opc_reflect_execute({method:"tot"})` | `opc_reflect_execute` | `method: "M6-tot"` |
| `opc_reflect_complete({method:"cove"})` | `opc_reflect_complete` | `method: "M3-cove"` + `result` |
| `opc_reflect_complete({method:"critique"})` | `opc_reflect_complete` | `method: "M4-critique"` + `result` |
| `opc_reflect_complete({method:"debate"})` | `opc_reflect_complete` | `method: "M5-debate"` + `result` |
| `opc_reflect_complete({method:"tot"})` | `opc_reflect_complete` | `method: "M6-tot"` + `result` |
| `opc_reflect_admin({action:"record_interventions"})` | `opc_reflect_admin` | `action: "record_interventions"` |
| `opc_reflect_admin({action:"on_demand"})` | `opc_reflect_admin` | `action: "on_demand"` |
| `opc_reflect_admin({action:"explain"})` | `opc_reflect_admin` | `action: "explain"` |
| `opc_reflect_admin({action:"query_stats"})` | `opc_reflect_admin` | `action: "query_stats"` |
| `opc_reflect_admin({action:"unlearn_method"})` | `opc_reflect_admin` | `action: "unlearn_method"` |

**新工具列表（5 个）**：
1. `opc_reflect_plan`
2. `opc_reflect_execute`（M3/M4/M5/M6 + 可选 inline 模式，见 2.4）
3. `opc_reflect_complete`（4 method 共用）
4. `opc_reflect_admin`（record_interventions/on_demand/explain/query_stats/unlearn_method）
5. —（5 个对外足够）

#### corrections（4 → 1）

| 旧工具 | 新工具 | discriminator |
|---|---|---|
| `opc_corrections({action:"query"})` | `opc_corrections` | `action: "query"` |
| `opc_corrections({action:"record"})` | `opc_corrections` | `action: "record"` |
| `opc_corrections({action:"unlearn"})` | `opc_corrections` | `action: "unlearn"` |
| `opc_corrections({action:"reindex"})` | `opc_corrections` | `action: "reindex"` |

**新工具列表（1 个）**：
1. `opc_corrections`（query/record/unlearn/reindex）

---

### 2.2 合并后总览（28 工具）

| 类别 | 工具 | 数 |
|---|---|---|
| **state-server flow** | query / lifecycle / step_complete / reflect / user_reply / quick_dispatch / correct | 7 |
| **state-server pipeline** | create / status / lifecycle | 3 |
| **state-server phase** | start / confirm / complete | 3 |
| **state-server node** | start / finish | 2 |
| **knowledge-server** | open / read / write / admin | 4 |
| **reflection-server** | plan / execute / complete / admin | 4 |
| **corrections** | corrections | 1 |
| **合计** | — | **24** |

> 实际 24（比 G1 目标 30 还少 6）。预留 6 个空位给未来新增能力（如 `opc_session_register` 配合 06 章 C2 的 HTTP/SSE 模式）。
>
> **P6 / P7 走 Validator-only 不走 reflection 工具面**：上表 `reflection-server` 4 个工具（plan/execute/complete/admin）只覆盖 P1–P5 / P8 五个反思位点；P6（节点执行）/ P7（阶段完成）由 state-manager 内部跑 V1–V5 + L1/L2，不产生 `reflection_id`、不受 reflection-registry-guard 保护、artifact 写到 `opc-logs/validator/`。详见 [02-server-design 三·补](../05-opc-reflection-server/02-server-design/00_overview.md#三补-p6--p7-不走-reflection-工具面边界澄清)。Claude 仍可主动调 `opc_reflect_execute({step:"node_execution"\|"phase_completion"})` 显式升级到反思工具面（按 method 走标准 5 步 / 3 步 inline）。

---

### 2.3 Discriminator 字段命名约定

| 场景 | 字段名 | 取值范围 |
|---|---|---|
| 生命周期类（start/abort/recover/complete/replan） | `action` | 动词字符串 |
| 流程步骤类（intent/task_analysis/...） | `step` | 与 `flow-state.json.current_step` 对齐的枚举 |
| 反思方法类（M3/M4/M5/M6） | `method` | `"M3-cove"` / `"M4-critique"` / `"M5-debate"` / `"M6-tot"` |
| 读取模式类（single/batch/list/search） | `mode` | 名词字符串 |
| 结果状态类（success/failed/retry） | `status` | 与 node.status 枚举对齐 |
| CRUD 类 | `action` | `"query"` / `"record"` / `"unlearn"` / `"reindex"` |

**规则**：
- 一个工具只有一个 discriminator 字段，禁止嵌套
- 不同 discriminator 值对应不同的 `input` schema 字段集（由 JSON Schema 的 `oneOf` 表达）
- 工具 description 必须列出所有 discriminator 值的语义

---

### 2.4 内联模式（解决反思链路调用爆炸）

**问题**（来自 `04-reflection-flow/06_call-sequence-contract.md 四 5 步铁律`）：
反思一轮 = 6 次调用（complete → plan → execute → Task → complete → flow_reflect）。

**方案**：`opc_reflect_execute` 增加 `inline: true` 入参，把 plan + execute + 内部 Task spawn + complete 一次性跑完，只返回最终 `pending_reflection`。

```typescript
// 旧：6 步
opc_<step>_complete(evidence)           // 1
  ← flow_next: opc_reflect_plan
opc_reflect_plan(step, ctx)             // 2
  ← method + agent_spec
opc_reflect_<method>(artifact, prompt)  // 3
  ← critic_spec
Task(critic_spec)                       // 4
opc_reflect_<method>_complete(obj)      // 5
  ← pending_reflection
opc_flow_reflect({reflection_id})       // 6

// 新：3 步
opc_flow_step_complete(step, evidence)  // 1
  ← flow_next: opc_reflect_execute({inline: true})
opc_reflect_execute({                   // 2
  step, method?: <auto>, artifact, inline: true
})
  ← 内部跑完 plan + Task + meta-validator + 写盘 artifact
  ← pending_reflection
opc_flow_reflect({reflection_id})       // 3
```

**保留非 inline 模式**：高级用户或多 sub-agent 协作场景仍可走 6 步路径（`opc_reflect_execute({inline: false})` 等价于旧 `opc_reflect_<method>`）。

**inline 模式的硬约束**：
- 一次 `opc_reflect_execute({inline: true})` 内部 Task spawn **必须只派 1 个 sub-agent**（多 sub-agent 走 debate 时 inline=false）
- inline 不跨 round，每轮独立调用

---

### 2.5 迁移策略

#### 阶段 1：文档（本 commit）

- 写本章 + Host contract 章（06）
- 不改任何工具规范文档

#### 阶段 2：文档全量更新（下一 commit）

按本章映射表，**改写所有出现旧工具名的文档**：

| 文档 | 修改类型 |
|---|---|
| `01-intent-analysis/02_03_04_*.md` | 重写工具规范，旧名 → 新名 + discriminator |
| `02-pipeline/09_tools.md` | 同上 |
| `03-phase/04_05_06_08_*.md` | 同上 |
| `04-node/07_tools.md` | 同上 |
| `03-opc-knowledge-server/02-knowledge-api/02_core-tools.md` | 同上 |
| `05-opc-reflection-server/02-server-design/00_overview.md 一` | 重写 13 工具表 |
| `05-opc-reflection-server/04-reflection-flow/06_call-sequence-contract.md` | 5 步铁律 → 3 步铁律（inline 模式） |
| 所有时序图（mermaid） | 工具名替换 + 步骤压缩 |
| 所有保护清单（registry-guard） | 工具名替换（详见 4.3） |

旧工具名作为 deprecated alias 保留 2 个版本周期，期间 server 同时响应新旧两套调用并 warn。

#### 阶段 3：实现

按新工具名实现 server，旧名作为 alias 转发。

---

## 三、单工具 schema 示例（验证 discriminator 的可读性）

### 3.1 `opc_flow_step_complete`

```typescript
{
  name: "opc_flow_step_complete",
  description: "提交流程步骤产出。step 字段决定走哪个分支：intent_analysis 收 intent + intent_evidence；task_analysis 收 analysis_result + task_analysis_evidence；task_decomposition 收 sub_pipelines + decomposition_evidence；brief_generation 收 brief_content。",
  input_schema: {
    type: "object",
    required: ["step"],
    properties: {
      step: {
        enum: ["intent_analysis", "task_analysis", "task_decomposition", "brief_generation"]
      }
    },
    oneOf: [
      { properties: { step: {const: "intent_analysis"}, intent: {...}, intent_evidence: {...}, reasoning: {type: "string"} } },
      { properties: { step: {const: "task_analysis"}, analysis_result: {...}, task_analysis_evidence: {...} } },
      { properties: { step: {const: "task_decomposition"}, sub_pipelines: {...}, execution_order: {...}, decomposition_evidence: {...} } },
      { properties: { step: {const: "brief_generation"}, brief_content: {type: "string"}, brief_evidence: {...} } }
    ]
  }
}
```

### 3.2 `opc_node_finish`

```typescript
{
  name: "opc_node_finish",
  description: "结束节点执行。status=success 收 evidence 跑 L1+L2 校验；status=failed 收 error 自动 retry；status=retry 手动重跑，自动级联重置下游。",
  input_schema: {
    type: "object",
    required: ["pipeline_id", "sub_pipeline_id", "node_name", "status"],
    properties: {
      pipeline_id: {type: "string"},
      sub_pipeline_id: {type: "string"},
      node_name: {type: "string"},
      status: {enum: ["success", "failed", "retry"]}
    },
    oneOf: [
      { properties: { status: {const: "success"}, evidence: {...} }, required: ["evidence"] },
      { properties: { status: {const: "failed"}, error: {type: "object", required: ["message", "type"]} }, required: ["error"] },
      { properties: { status: {const: "retry"}, reset_retry_count: {type: "boolean", default: true} } }
    ]
  }
}
```

### 3.3 `opc_reflect_execute`

```typescript
{
  name: "opc_reflect_execute",
  description: "执行反思方法。method=M3-cove 拆断言逐条验证；M4-critique 派 critic 列 objection；M5-debate 多 agent 辩论；M6-tot 多分支搜索。inline=true 时一次性跑完 plan + Task + complete，返回 pending_reflection；inline=false 仅返回 agent_spec 让 Host 自行派 Task。",
  input_schema: {
    type: "object",
    required: ["step", "method", "artifact"],
    properties: {
      step: {enum: ["intent_analysis", "task_analysis", "task_decomposition", "brief_generation", "node_selection", "node_execution", "phase_completion", "phase_advance"]},
      method: {enum: ["M3-cove", "M4-critique", "M5-debate", "M6-tot"]},
      artifact: {type: "object"},
      inline: {type: "boolean", default: true},
      enhanced_prompt: {type: "string"}
    }
  }
}
```

---

## 四、不变量与契约保护

### 4.1 不变工具名（这些工具名是契约锚点，永久保留）

| 工具 | 锚点用途 |
|---|---|
| `opc_flow_query` | hook 注入文本里写死的工具名 |
| `opc_flow_reflect` | reflection-registry-guard 的 `must_be_registered_by` 字段值；A3 闭环里 `pending_reflection.must_be_registered_by` |
| `opc_flow_user_reply` | A3 闭环 `pending_user_question.must_be_resolved_by` 字段值 |
| `opc_phase_confirm` / `opc_phase_complete` / `opc_node_start` / `opc_pipeline_lifecycle({action:"complete"})` | reflection-registry-guard / pending-question-guard 的保护清单成员 |
| `opc_quick_dispatch` | low 通道独立语义 |

### 4.2 不变 discriminator 值（这些枚举值不可改名）

| 枚举 | 用途 |
|---|---|
| `step_id` 8 项（intent_analysis/task_analysis/task_decomposition/brief_generation/node_selection/node_execution/phase_completion/phase_advance） | `opc_flow_reflect.step_id` 入参；`flow-state.reflection_log[].step_id` 持久化字段 |
| `method` 4 项（M3-cove/M4-critique/M5-debate/M6-tot） | `reflection_log[].method` 持久化字段 |
| `node.status` 3 项（success/failed/retry） | 工具入参 + state.json 字段 |

### 4.3 registry-guard 保护清单的工具名更新

`05-opc-reflection-server/04-reflection-flow/06_call-sequence-contract.md 七 防御 3` 的 9 项保护清单按本章映射更新：

| # | 旧工具 | 新工具 |
|---|---|---|
| 1 | `opc_flow_reflect` | `opc_flow_reflect`（不变）|
| 2 | `opc_flow_step_complete({step:"task_analysis"})` | `opc_flow_step_complete({step: "task_analysis"})` |
| 3 | `opc_flow_step_complete({step:"task_decomposition"})` | `opc_flow_step_complete({step: "task_decomposition"})` |
| 4 | `opc_flow_step_complete({step:"brief_generation"})` | `opc_flow_step_complete({step: "brief_generation"})` |
| 5 | `opc_pipeline_create` | `opc_pipeline_create`（不变）|
| 6 | `opc_phase_confirm` | `opc_phase_confirm`（不变）|
| 7 | `opc_node_start` | `opc_node_start`（不变）|
| 8 | `opc_phase_complete` | `opc_phase_complete`（不变）|
| 9 | `opc_pipeline_lifecycle({action:"complete"})` | `opc_pipeline_lifecycle({action: "complete"})` |

**guard 实现的处理**：保护清单 enforce 改为按 **(工具名, discriminator 值)** 对的方式校验，例如 `opc_pipeline_lifecycle` 在 `action: "complete"` 时受保护，`action: "abort"` 时不受保护（豁免清单原本就含 abort）。

### 4.4 豁免清单更新

原豁免清单（`opc_flow_correct({action:"revise"})` / `opc_flow_correct({action:"restart"})` / `opc_pipeline_lifecycle({action:"replan"})` / `opc_flow_correct({action:"phase_reset"})` / `opc_flow_lifecycle({action:"abort"})` / `opc_node_finish({status:"success"})` / `opc_node_finish({status:"failed"})`）映射为：

| 旧 | 新 |
|---|---|
| `opc_flow_correct({action:"revise"})` | `opc_flow_correct({action: "revise"})` |
| `opc_flow_correct({action:"restart"})` | `opc_flow_correct({action: "restart"})` |
| `opc_flow_correct({action:"phase_reset"})` | `opc_flow_correct({action: "phase_reset"})` |
| `opc_pipeline_lifecycle({action:"replan"})` | `opc_pipeline_lifecycle({action: "replan"})` |
| `opc_flow_lifecycle({action:"abort"})` | `opc_flow_lifecycle({action: "abort"})` |
| `opc_node_finish({status:"success"})` | `opc_node_finish({status: "success"})` |
| `opc_node_finish({status:"failed"})` | `opc_node_finish({status: "failed"})` |

即：**整个 `opc_flow_correct` 工具全部豁免**；`opc_pipeline_lifecycle` 仅 `replan` / `abort` 豁免；`opc_node_finish` 全部豁免（sub-agent 回报通道）。

---

## 五、Token 占用估算

| 阶段 | 工具数 | 平均 schema + description token | 总 token |
|---|---|---|---|
| 现状 | 54 | ~300 | ~16k |
| 裁剪后 | 24 | ~400（discriminator 后 schema 略大） | ~9.6k |
| 节省 | -30 | — | **~6.4k token / 每次 system prompt 加载** |

按平均每个 session 100 轮对话计：节省 ≈ **640k token / session**，按当前 Claude Opus 价格折合可观。

---

## 六、风险与缓解

| 风险 | 缓解 |
|---|---|
| Claude 误用 discriminator（如 `opc_flow_step_complete({step: "intent_analysis", analysis_result: {...}})`）| JSON Schema 的 `oneOf` 在 MCP 协议层做校验，server 收到不匹配的 schema 直接 reject |
| 旧文档/教程中的工具名失效 | 旧名 alias 保留 2 版本 + warning 引导 |
| guard 实现复杂度上升（要校验 discriminator） | 用单测覆盖所有 (工具, discriminator) 组合 |
| 反思 inline 模式黑盒化（一次调用做太多事） | 完整 reasoning_trace 仍写盘到 artifact，可观测性不变 |

---

## 七、子文档导航（占位）

| 子文档 | 内容 |
|---|---|
| 01_discriminator-schema-examples.md | 所有合并工具的完整 JSON Schema 示例 |
| 02_migration-checklist.md | 阶段 2 文档全量更新的逐文件 checklist |
| 03_deprecated-alias-spec.md | 旧名 alias 的 server 实现规范 + warning 文案 |

---

## 八、核心设计原则

- **Discriminator 优于多工具**：同类不同方法折叠到一个工具，靠入参分流
- **契约锚点不可动**：registry-guard / A3 闭环依赖的工具名永久保留
- **不丢失能力**：每条裁剪可回溯到原工具，行为零变化
- **可迁移**：旧名 alias 保留 2 版本周期
- **可观测**：reasoning_trace / reflection_log 仍按 step_id 持久化，工具合并不影响日志结构

---

## 九、相关文档

- [01-overview/00_index.md](../01-overview/00_index.md) — 全局架构（已更新指向本章）
- [06-host-contract/00_overview.md](../06-host-contract/00_overview.md) — Host 行为契约（解决 sub-agent 传递性）
- [05-opc-reflection-server/04-reflection-flow/06_call-sequence-contract.md](../05-opc-reflection-server/04-reflection-flow/06_call-sequence-contract.md) — registry-guard 保护清单（需按本章 4.3 同步更新）
- [02-opc-state-server/01-intent-analysis/02_flow-tools-entry-lifecycle.md](../02-opc-state-server/01-intent-analysis/02_flow-tools-entry-lifecycle.md) — 旧 flow 工具总览（阶段 2 改写）
