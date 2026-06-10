# 流程工具 · 步骤路由

> 本文档是 [意图分析总览](00_overview.md) 的子文档。其他子文档：
> [Hook 与混合架构](01_hook-architecture.md) · [流程工具 · 入口与生命周期](02_flow-tools-entry-lifecycle.md) · [流程工具 · 修订与重启](04_flow-tools-revise-restart.md) · [意图识别](05_intent-recognition.md) · [任务分析](06_task-analysis.md) · [任务拆分](07_task-decomposition.md) · [工作单生成](08_brief-generation.md) · [管线创建与阶段执行](09_pipeline-creation.md) · [flow-state schema](10_flow-state-schema.md) · [完整流程示例](11_complete-example.md)

---

## 步骤路由类工具

本篇覆盖 **4 个步骤推进类工具**——它们按 reflection-server 的 evidence + V1-V5 validator 结果 / `intent` / `complexity` 把流程从一个步骤路由到下一个。完整工具速览见 [入口与生命周期篇 流程工具总览](02_flow-tools-entry-lifecycle.md#流程工具总览m17g-后-7-工具)。

> reflection-server 的 P1-P8 反思位点、evidence schema、V1-V5 + meta-validator、primary/secondary 方法表见 [05-opc-reflection-server 总览](../../05-opc-reflection-server/00_index.md)。

| 工具 | discriminator | 一句话职责 |
|------|------|----------|
| [`opc_flow_step_complete`](#opc_flow_step_complete) | `step` ∈ {intent_analysis, task_analysis, task_decomposition, brief_generation} | 提交分析步骤产出 + evidence，按 V1-V5 + meta-validator + intent/complexity 路由到下一步 |
| [`opc_flow_reflect`](#opc_flow_reflect) | — | 登记 reflection-server 已写盘的反思 artifact（按 `reflection_id`），按 verdict 决定继续/跳出/ask_user |
| [`opc_flow_user_reply`](#opc_flow_user_reply) | — | A3 闭环登记口：回灌用户对 ask_user 的答复，按 step_id 路由续上 |
| [`opc_quick_dispatch`](#opc_quick_dispatch) | — | low 复杂度快速通道：返回 agent_hint + knowledge_context，流程自动 complete |

> Deprecated 别名映射：`opc_flow_step_complete({step:"intent_analysis"})` → `opc_flow_step_complete({step:"intent_analysis"})`；`opc_flow_step_complete({step:"task_analysis"})` → `({step:"task_analysis"})`；`opc_flow_step_complete({step:"task_decomposition"})` → `({step:"task_decomposition"})`；`opc_flow_step_complete({step:"brief_generation"})` → `({step:"brief_generation"})`。完整映射见 [07-tool-consolidation §2.1 state-server flow](../../07-tool-consolidation/00_overview.md#state-server-flow14--7)。

---

### opc_flow_step_complete

**职责**：提交分析步骤产出，按 P1-P4 反思位点的 evidence + V1-V5 + meta-validator + intent/complexity 路由到下一步。`step` discriminator 决定 input schema 走哪个分支、走哪个反思位点。

**Schema 速览**：

```typescript
{
  name: "opc_flow_step_complete",
  description: "提交流程步骤产出。step 字段决定走哪个分支：intent_analysis 收 intent + intent_evidence；task_analysis 收 analysis_result + task_analysis_evidence；task_decomposition 收 sub_pipelines + decomposition_evidence；brief_generation 收 brief_content。",
  input_schema: {
    type: "object",
    required: ["step"],
    properties: { step: { enum: ["intent_analysis", "task_analysis", "task_decomposition", "brief_generation"] } },
    oneOf: [
      { properties: { step: {const: "intent_analysis"}, intent: {...}, intent_evidence: {...}, reasoning: {type: "string"} } },
      { properties: { step: {const: "task_analysis"}, analysis_result: {...}, task_analysis_evidence: {...} } },
      { properties: { step: {const: "task_decomposition"}, sub_pipelines: {...}, execution_order: {...}, decomposition_evidence: {...} } },
      { properties: { step: {const: "brief_generation"}, brief_content: {type: "string"}, brief_evidence: {...} } }
    ]
  }
}
```

#### step=intent_analysis

**输入**：`{step: "intent_analysis", intent, intent_evidence, reasoning}`，其中 `intent_evidence` schema 包含 `task_criteria_hits[]` / `chat_signals[]` / `user_quotes[]`（详见 [05-opc-reflection-server/02-server-design/00_overview.md 二](../../05-opc-reflection-server/02-server-design/00_overview.md#二evidence-schema)）。

> 本步骤走 reflection-server **P1 反思位点**，primary 方法 = M3 CoVe，secondary = M4 Critique。验证器与方法定义见 [05-opc-reflection-server/01-method-theory/00_overview.md 五](../../05-opc-reflection-server/01-method-theory/00_overview.md#五step--方法-选择决策表primary--secondary)。

**路由表**：

| 入参 intent | V1-V5 + meta-validator 结果 | 返回的 next | 流程终结 |
|------------|-----------|------------|---------|
| `task` | pass + 无严重 objection | `{tool: "opc_flow_step_complete", args: {step: "task_analysis"}}` + prerequisites:[opc_knowledge_read({mode:"list"})] | 否 |
| `task` | pass + 中等 objection | 同上 + step_instruction 提示向用户简短确认（附 reasoning_trace） | 否 |
| `task` | fail 或 严重 objection | `{action: "reflect"}` + 进入 P1 反思（primary=M3 CoVe，secondary=M4 Critique）；rounds 耗尽 → ask_user | 否 |
| `project_question` | pass | `{action: "respond_with_knowledge"}` + prerequisites:[opc_knowledge_read({mode:"search"})] | **是**（内部自动标记 flow-state.status=completed） |
| `general_question` / `chat` | 任意 | `{done: true, action: "respond_normally"}` | **是**（同上） |

#### step=task_analysis

**输入**：`{step: "task_analysis", analysis_result, task_analysis_evidence}`，其中：
- `analysis_result.knowledge_plan: [{path, operation: "create"|"update"|"read"}]`
- `analysis_result.phase_selection_rationale: string`（必填，写入 state.json.phase_plan.selection_rationale）
- `task_analysis_evidence` schema 包含 `requirements[]` / `dependencies[]` / `risks[]` / `knowledge_plan` 等（详见 [05-opc-reflection-server/02-server-design/00_overview.md 二](../../05-opc-reflection-server/02-server-design/00_overview.md#二evidence-schema)）。

> 本步骤走 reflection-server **P2 反思位点**，primary 方法 = M3 CoVe，secondary = M2 Reflexion。

**路由逻辑**：

```
输入: analysis_result + task_analysis_evidence
  ↓
计算 modify_unit_count = count(distinct unit) where:
    unit = knowledge_plan[i].path.split("/")[0]
    knowledge_plan[i].operation ∈ ["create", "update"]
  (按 unit 去重，多个 subsection 在同一 unit 只算 1)
  ↓
分支 1: V1-V5 validator + meta-validator 判定
  ├── pass + 无严重 objection      → 跳过反思 → 进入分支 2
  ├── pass + 中等 objection        → 跳过反思 → 进入分支 2，step_instruction 附 reasoning_trace
  └── fail 或 严重 objection       → 返回 opc_flow_reflect 指令（primary=M3 CoVe，secondary=M2 Reflexion，受 rounds-guard 约束）

分支 2: 复杂度/拆分判定（仅 validator 通过或反思后到达）
  ├── complexity = low → 返回 opc_quick_dispatch 指令（处理后流程自动 complete）
  ├── modify_unit_count ≥ 2 → 返回 opc_flow_step_complete({step:"task_decomposition"}) 指令
  └── modify_unit_count ≤ 1 → 返回 opc_flow_step_complete({step:"brief_generation"}) 指令
```

#### step=task_decomposition

**输入**：`{step: "task_decomposition", sub_pipelines, execution_order, decomposition_evidence}`，其中 `decomposition_evidence` schema 包含 `boundary_rationale[]` / `dependency_graph` / `unit_isolation_check[]` 等。

> 本步骤走 reflection-server **P3 反思位点**，primary 方法 = M6 ToT（探索多种切分方案），secondary = M5 Debate（complexity ≥ medium 时启用）。

**路由表**：

| V1-V5 + meta-validator 结果 | 返回的 next | step_instruction |
|------|--------|--------|
| pass + 无严重 objection | `opc_flow_step_complete({step:"brief_generation"})` | "拆分方案 evidence 通过验证，开始生成 brief" |
| pass + 中等 objection | 同上 | "拆分方案 evidence 部分通过，展示方案 + reasoning_trace 后开始生成 brief" |
| fail 或 严重 objection | reflect | "拆分 evidence 未通过验证，进入 P3 反思（primary=M6 ToT，secondary=M5 Debate）；rounds 耗尽 → ask_user" |

#### step=brief_generation

**输入**：`{step: "brief_generation", brief_content: string}`

**推导规则**（从 `flow-state.json.accumulated` 推导 `opc_pipeline_create` 全部参数）：

```
· description, tags, complexity, knowledge_unit, suggested_phases, scenario
    ← 取自 accumulated.analysis_result
· brief_content
    ← 当前调用入参
· sub_pipelines:
    有 decomposition_result → 用 decomposition.sub_pipelines
    无 → [{id: "sub-1", title: <description 截短>,
            knowledge_unit: analysis.knowledge_unit, blocked_by: []}]
· execution_order:
    有 decomposition → 用 decomposition.execution_order
    无 → [{group: 1, sub_pipeline_ids: ["sub-1"]}]
```

**返回示例**：

```json
{
  "step": "brief_completed",
  "step_instruction": "Brief 已生成。下一步创建管线，参数已预填，直接调用 next.tool。",
  "next": {
    "tool": "opc_pipeline_create",
    "args": {
      "description": "实现用户认证系统",
      "complexity": "medium",
      "knowledge_unit": ["user-auth"],
      "sub_pipelines": [{"id": "sub-1", "knowledge_unit": ["user-auth"], "blocked_by": []}],
      "execution_order": [{"group": 1, "sub_pipeline_ids": ["sub-1"]}],
      "brief_content": "<上一步收到的 brief 全文>"
    }
  },
  "flow_state_path": ".opc/sessions/sess-abc/flow-state.json"
}
```

---

### opc_flow_reflect

**职责**：登记 reflection-server 已写盘的反思 artifact（按 `reflection_id` 索引），追加到 `flow-state.json.reflection_log[]`，按 step_id 分流到会话级或管线级指针；按 artifact 中的 verdict + rounds-guard 决定是否跳出反思。

> ⚠️ **驱动权契约**：`opc_flow_reflect` 是 reflection 链路里唯一能返回 `flow_next` 的工具。它是 state-server 与 reflection-server 协作的**登记口**——`opc_reflect_*_complete` 发出的 `pending_reflection.reflection_id` 必须在这里被登记，否则后续受 registry-guard 保护的写工具都会被拒绝。完整命名约定 / 不变量 / 工具清单 / 契约见 [05-opc-reflection-server/04-reflection-flow/06_call-sequence-contract.md](../../05-opc-reflection-server/04-reflection-flow/06_call-sequence-contract.md)。

**输入**：

```typescript
{
  reflection_id: string,                   // ⭐ 来自 opc_reflect_*_complete.pending_reflection.reflection_id
  step_id: 'intent_analysis' | 'task_analysis' | 'task_decomposition'
         | 'brief_generation' | 'node_selection' | 'node_execution'
         | 'phase_completion' | 'phase_advance',  // 完整 8 项枚举见 07_three-server-seam-matrix.md 3.1
  pipeline_id?: string,                    // step_id ∈ {node_selection, node_execution, phase_completion, phase_advance} 时必填
  sub_pipeline_id?: string,                // 同上
  phase?: string,                          // 同上
  notes?: string
}
```

- `reflection_id` — reflection-server 已写盘 artifact 的稳定 ID（形如 `rfl-P5-r2-01HXY8`）。state-server 据此从 `flow-state.pending_reflections[]` 找到 pending 项，读 `artifact_path` 拿反思全文。缺失 / 不匹配 → reject (`error: missing_or_invalid_reflection_id`)
- **不再有 `ack_token` / `reflect_record` / `evidence_diff` 入参**：反思内容物理在 artifact 文件里，state-server 自己读，Claude 不再整块搬运。`round` 字段由 state-server 按 `reflection_log` 现有长度推导，不接受入参。

> 反思内容物 schema（artifact 文件里的字段如 `verdict / kept_objections / reasoning_trace / evidence_diff / fp_rate`）由 reflection-server 决定，见 [05-opc-reflection-server/02-server-design/00_overview.md 二](../../05-opc-reflection-server/02-server-design/00_overview.md#二evidence-schema)。完整命名约定 + 不变量 + 5 步铁律见 [06_call-sequence-contract.md](../../05-opc-reflection-server/04-reflection-flow/06_call-sequence-contract.md)。

**行为**：

```
① registry-guard 校验:
   读 flow-state.json.pending_reflections[]
   ├── 入参 reflection_id 不在 pending_reflections → reject (error: missing_or_invalid_reflection_id)
   ├── pending.expires_at 已过 → reject (error: reflection_id_expired)
   └── 命中 → 进入②

② 读 artifact:
   读 pending.artifact_path
   ├── 文件不存在 → reject (error: artifact_missing, artifact_path)
   ├── JSON 解析失败 / 缺关键字段 (verdict / reasoning_trace) → reject (error: artifact_invalid)
   └── 合法 → 抽出 {verdict, kept_objections, reasoning_trace, evidence_diff, method}

③ 按 step_id 分流登记:
   ├── step_id ∈ {intent_analysis, task_analysis, task_decomposition, brief_generation}
   │     → 追加到 flow-state.json.reflection_log[]
   │        {reflection_id, artifact_path, step_id, verdict, registered_at}
   │     · 不需要 pipeline_id / sub_pipeline_id / phase
   └── step_id ∈ {node_selection, node_execution, phase_completion, phase_advance}
        → 必须带 pipeline_id + sub_pipeline_id + phase（+ node_execution 时带 node）
        · 主存储：state.json.phases[<phase>].reflection_log[]
        · 同时在 flow-state.json.reflection_log[] 留指针
          {reflection_id, artifact_path, pipeline_pointer_ref, log_entry_id}

④ 从 pending_reflections[] 移除该项（hard invariant 校验：移除后 length == 0）

⑤ 路由判定（基于 artifact.verdict + rounds-guard）:
   ├── verdict=clean                          → flow_next: 上层 step 继续工具
   │                                            （如 node_selection → opc_phase_confirm）
   ├── verdict=objections_remain + 未达 max_rounds → flow_next: opc_reflect_plan
   │                                                  （下一轮反思；reflection-server 内部决定 method 切换）
   └── verdict=rounds_exceeded（达到 max_rounds 仍 objections_remain）
                                              → flow_next: ask_user + reasoning_trace
                                                （A3 闭环：写 pending_user_question，Claude 显示给用户后调 opc_flow_user_reply 回灌）
```

**返回**：

```typescript
{
  registered: true,
  reflection_id: string,
  artifact_path: string,
  log_entry_id: string,
  flow_next: {
    tool: 'opc_phase_confirm' | 'opc_reflect_plan' | ...,
    args?: object,
    why: string
  } | { action: 'ask_user', reasoning_trace: string[] }
}
```

**反思日志位置分流原因**：
- P1–P4 (会话级) 反思一次性事件，主存储 flow-state.json
- P5–P8 (管线级) 反思可发生在多个 phase，主存储 state.json 才能随 phase_reset 回退；flow-state 留指针便于全局排查

---

### opc_flow_user_reply

**职责**：A3 ask_user 回灌闭环的**唯一登记口**——接收 Claude 转译后的用户答复，写入 L1 user_interventions，应用 accumulated_patch，清 pending_user_question，按触发 step 路由 flow_next 续上。

> ⚠️ **驱动权契约**：与 `opc_flow_reflect` 平级，是 ask_user 路径里**唯一能返回 flow_next 的工具**。`opc_flow_reflect` 触发 `rounds_exceeded` 后写入的 `pending_user_question` 必须在这里被回灌，否则后续受 pending-question-guard 保护的写工具都会被拒绝。完整闭环契约见 [05-opc-reflection-server/04-reflection-flow/06_call-sequence-contract.md 八·补 ask_user 回灌闭环](../../05-opc-reflection-server/04-reflection-flow/06_call-sequence-contract.md#八补-ask_user-回灌闭环a3-契约)。

**输入**：

```typescript
{
  question_id: string,                  // ⭐ 来自 flow-state.pending_user_question.question_id
  user_reply: string,                   // 用户原话（保真存档供 distiller 提炼）
  resolution: {                         // Claude 把用户原话转译为结构化更新
    accumulated_patch?: object,         // 对 flow-state.accumulated 字段级 patch
                                        //   例：{complexity: "high", knowledge_unit: [..., "audit"]}
    objections_resolved?: string[],     // 用户答复显式解决的 objection id
                                        //   （取自 pending_user_question.kept_objections[].id）
    objections_dismissed?: string[],    // 用户决定"忽略"的 objection id
    selected_nodes?: string[],          // step_id=node_selection 时，用户裁定的节点列表
    advance_decision?: 'advance' | 'reset',  // step_id=phase_advance 时，用户裁定推进或回退
    notes?: string                      // 可选解释
  }
}
```

- `question_id` — flow-state.pending_user_question 的稳定 ID。缺失 / 不匹配 → reject (`error: missing_or_invalid_question_id`)
- `resolution` — Claude 必须把用户自然语言答复转译为结构化字段，state-server 不做 LLM 解析

**行为**：

```
① pending-question-guard 校验:
   读 flow-state.json.pending_user_question
   ├── null → reject (error: no_pending_question)
   ├── question_id 不匹配 → reject (error: missing_or_invalid_question_id)
   ├── pending.expires_at 已过 → reject (error: question_id_expired)
   └── 命中 → 进入②

② pending_reflections 健全校验:
   if pending_reflections.length != 0:
     → reject (error: invariant_violation_pending_reflection_remains)
     （rounds_exceeded 触发时上一轮反思必已登记）

③ 写 L1 user_interventions[]:
   追加 {
     intervention_id: "intv-<ulid>",
     trigger: "ask_user_rounds_exceeded",
     step_id: pending.step_id,
     question_id: pending.question_id,
     question_summary: pending.reasoning_trace[0],
     user_reply: <入参 user_reply>,
     resolution: <入参 resolution>,
     linked_reflection_artifacts: pending.context_artifacts,
     at: now
   }

④ 应用 resolution.accumulated_patch 到 flow-state.accumulated（字段级 merge）

⑤ 清 pending_user_question = null

⑥ 路由 flow_next（按 pending.step_id）:
   见 [06_call-sequence-contract.md 八·补 flow_next 路由表](../../05-opc-reflection-server/04-reflection-flow/06_call-sequence-contract.md#flow_next-路由表按触发-ask_user-的-step_id)
   每条路由都附带 _skip_reflection_once: true，避免立刻又走 rounds-guard 形成 ping-pong
```

**返回**：

```typescript
{
  intervention_recorded: true,
  intervention_id: string,
  question_id: string,
  accumulated_updated: object,          // 实际写入的 patch（含 merge 后的全字段）
  flow_next: {
    tool: 'opc_flow_step_complete' | 'opc_phase_confirm' | ...,    // step_complete 含 step: "task_analysis" 等 discriminator
    args: object,                       // 含 _skip_reflection_once: true
    why: string
  }
}
```

**失败返回示例**：

```typescript
// 场景：Claude 跳过 opc_flow_user_reply 直接调 opc_phase_confirm
{
  error: "pending_user_question",
  message: "存在未回灌的用户提问，无法推进 phase_confirm",
  question_id: "uq-P5-r2-01HXY8",
  asked_at: "...",
  step_id: "node_selection",
  required_action: {
    tool: "opc_flow_user_reply",
    args: { question_id: "uq-P5-r2-01HXY8" },
    why: "先把用户答复回灌到流程，再推进"
  }
}
```

---

### opc_quick_dispatch

**职责**：low 复杂度快速通道：返回 agent_hint + knowledge_context，流程自动 complete。

**输入**：`{description, tags, knowledge_unit}`

**行为**：

```
opc_quick_dispatch({description, tags, knowledge_unit})
  → 扫描已安装 kit 的 plugin.json capabilities → tags 匹配最佳 agent
  → 读 opc-knowledge/<unit>/ 结构 → 拼 knowledge_context（仅结构 + version，不读 .md 内容）
  → 写 .opc/quick-history.jsonl 追加一条 {timestamp, description, agent, units}
  → 写 flow-state.json.status = completed（low 流程不创建 pipeline 直接终结）
  → 返回:
    {
      step: "quick_dispatch",
      agent_hint: "frontend-engineer",
      knowledge_context: { units: {"user-auth": {login: {ui: {version: 1}}}} },
      step_instruction: "Task spawn 该 agent，传入 description + knowledge_context；agent 自行决定读哪些知识 + 直接改文件",
      dispatch_context: {
        instruction_template: "你是 <agent>，执行轻量任务：<description>。已有知识结构：<knowledge_context>。直接修改文件，无需调任何 opc_* 工具。"
      }
    }
```

---

## 相关文档

- [02_flow-tools-entry-lifecycle.md](02_flow-tools-entry-lifecycle.md) — 入口（`opc_flow_query`）+ 生命周期（`opc_flow_lifecycle`）
- [04_flow-tools-revise-restart.md](04_flow-tools-revise-restart.md) — `opc_flow_correct`（revise / restart / phase_reset）+ 前置校验
- [06_task-analysis.md](06_task-analysis.md) — `opc_flow_step_complete({step:"task_analysis"})` 的方法论
- [07_task-decomposition.md](07_task-decomposition.md) — `opc_flow_step_complete({step:"task_decomposition"})` 的方法论
- [08_brief-generation.md](08_brief-generation.md) — `opc_flow_step_complete({step:"brief_generation"})` 的方法论
- [07-tool-consolidation/00_overview.md](../../07-tool-consolidation/00_overview.md#21-合并映射表54--24) — step discriminator 映射规范
