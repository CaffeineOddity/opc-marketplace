# 流程工具 · 步骤路由

> 本文档是 [意图分析总览](00_overview.md) 的子文档。其他子文档：
> [Hook 与混合架构](01_hook-architecture.md) · [流程工具 · 入口与生命周期](02_flow-tools-entry-lifecycle.md) · [流程工具 · 修订与重启](04_flow-tools-revise-restart.md) · [意图识别](05_intent-recognition.md) · [任务分析](06_task-analysis.md) · [任务拆分](07_task-decomposition.md) · [工作单生成](08_brief-generation.md) · [管线创建与阶段执行](09_pipeline-creation.md) · [flow-state schema](10_flow-state-schema.md) · [完整流程示例](11_complete-example.md)

---

## 步骤路由类工具

本篇覆盖 **6 个步骤推进类工具**——它们按 reflection-server 的 evidence + V1-V5 validator 结果 / `intent` / `complexity` 把流程从一个步骤路由到下一个。完整工具速览见 [入口与生命周期篇 §流程工具总览](02_flow-tools-entry-lifecycle.md#流程工具总览)。

> reflection-server 的 P1-P8 反思位点、evidence schema、V1-V5 + meta-validator、primary/secondary 方法表见 [05-opc-reflection-server 总览](../../05-opc-reflection-server/00_index.md)。

| 工具 | 一句话职责 |
|------|----------|
| [`opc_intent_complete`](#opc_intent_complete) | 按 intent + P1 intent_evidence 路由：task → 分析；question/chat → 流程内部自动 complete |
| [`opc_task_analysis_complete`](#opc_task_analysis_complete) | 按 P2 task_analysis_evidence + complexity + modify_unit_count 三路分流 |
| [`opc_decomposition_complete`](#opc_decomposition_complete) | 按 P3 decomposition_evidence 路由：validator pass → 简报；fail → 反思 |
| [`opc_brief_complete`](#opc_brief_complete) | 从 accumulated 推导 args，返回 next: opc_pipeline_create |
| [`opc_flow_reflect`](#opc_flow_reflect) | 持久化反思日志（按 step_id 分流到会话级或管线级；记录 evidence_diff + meta-validator 结果） |
| [`opc_quick_dispatch`](#opc_quick_dispatch) | low 复杂度快速通道：返回 agent_hint + knowledge_context，流程自动 complete |

---

### opc_intent_complete

**职责**：按 intent + P1 intent_evidence 通过 reflection-server V1-V5 validator + meta-validator 路由到下一步；question/chat 时内部自动标记流程终结。

**输入**：`{intent, intent_evidence, reasoning}`，其中 `intent_evidence` schema 包含 `task_criteria_hits[]` / `chat_signals[]` / `user_quotes[]`（详见 [05-opc-reflection-server/02-server-design/00_overview.md §二](../../05-opc-reflection-server/02-server-design/00_overview.md#二evidence-schema)）。

> 本步骤走 reflection-server **P1 反思位点**，primary 方法 = M3 CoVe，secondary = M4 Critique。验证器与方法定义见 [05-opc-reflection-server/01-method-theory/00_overview.md §五](../../05-opc-reflection-server/01-method-theory/00_overview.md#五step--方法-选择决策表primary--secondary)。

**路由表**：

| 入参 intent | V1-V5 + meta-validator 结果 | 返回的 next | 流程终结 |
|------------|-----------|------------|---------|
| `task` | pass + 无严重 objection | `{tool: "opc_task_analysis_complete"}` + prerequisites:[opc_knowledge_list] | 否 |
| `task` | pass + 中等 objection | `{tool: "opc_task_analysis_complete"}` + step_instruction 提示向用户简短确认（附 reasoning_trace） | 否 |
| `task` | fail 或 严重 objection | `{action: "reflect"}` + 进入 P1 反思（primary=M3 CoVe，secondary=M4 Critique）；budget 耗尽 → ask_user | 否 |
| `project_question` | pass | `{action: "respond_with_knowledge"}` + prerequisites:[opc_knowledge_search] | **是**（内部自动标记 flow-state.status=completed） |
| `general_question` / `chat` | 任意 | `{done: true, action: "respond_normally"}` | **是**（同上） |

---

### opc_task_analysis_complete

**职责**：按 P2 task_analysis_evidence 通过 reflection-server V1-V5 validator + meta-validator 结果 + complexity + modify_unit_count 三路分流到反思 / 拆分 / 简报 / 快速通道。

**输入**：`{analysis_result, task_analysis_evidence}`，其中：
- `analysis_result.knowledge_plan: [{path, operation: "create"|"update"|"read"}]`
- `analysis_result.phase_selection_rationale: string`（必填，写入 state.json.phase_plan.selection_rationale）
- `task_analysis_evidence` schema 包含 `requirements[]` / `dependencies[]` / `risks[]` / `knowledge_plan` 等（详见 [05-opc-reflection-server/02-server-design/00_overview.md §二](../../05-opc-reflection-server/02-server-design/00_overview.md#二evidence-schema)）。

> 本步骤走 reflection-server **P2 反思位点**，primary 方法 = M3 CoVe，secondary = M2 Reflexion。验证器与方法定义见 [05-opc-reflection-server/01-method-theory/00_overview.md §五](../../05-opc-reflection-server/01-method-theory/00_overview.md#五step--方法-选择决策表primary--secondary)。

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
  └── fail 或 严重 objection       → 返回 opc_flow_reflect 指令（primary=M3 CoVe，secondary=M2 Reflexion，受 budget-guard 约束）

分支 2: 复杂度/拆分判定（仅 validator 通过或反思后到达）
  ├── complexity = low → 返回 opc_quick_dispatch 指令（处理后流程自动 complete）
  ├── modify_unit_count ≥ 2 → 返回 task_decomposition 指令
  └── modify_unit_count ≤ 1 → 返回 brief_generation 指令
```

---

### opc_decomposition_complete

**职责**：按 P3 decomposition_evidence 通过 reflection-server V1-V5 validator + meta-validator 路由：通过 → 简报；失败 → 反思。

**输入**：`{sub_pipelines, execution_order, decomposition_evidence}`，其中 `decomposition_evidence` schema 包含 `boundary_rationale[]` / `dependency_graph` / `unit_isolation_check[]` 等（详见 [05-opc-reflection-server/02-server-design/00_overview.md §二](../../05-opc-reflection-server/02-server-design/00_overview.md#二evidence-schema)）。

> 本步骤走 reflection-server **P3 反思位点**，primary 方法 = M6 ToT（探索多种切分方案），secondary = M5 Debate（complexity ≥ medium 时启用）。

**路由表**：

| V1-V5 + meta-validator 结果 | 返回的 next | step_instruction |
|------|--------|--------|
| pass + 无严重 objection | brief_generation | "拆分方案 evidence 通过验证，开始生成 brief" |
| pass + 中等 objection | brief_generation | "拆分方案 evidence 部分通过，展示方案 + reasoning_trace 后开始生成 brief" |
| fail 或 严重 objection | reflect | "拆分 evidence 未通过验证，进入 P3 反思（primary=M6 ToT，secondary=M5 Debate）；budget 耗尽 → ask_user" |

---

### opc_brief_complete

**职责**：从 `flow-state.json.accumulated` 推导 `opc_pipeline_create` 全部参数，返回预填的下一步指令。

**输入**：`{brief_content: string}`

**推导规则**：

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
    无 → [{group: 1, parallel: ["sub-1"]}]
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
      "execution_order": [{"group": 1, "parallel": ["sub-1"]}],
      "brief_content": "<上一步收到的 brief 全文>"
    }
  },
  "flow_state_path": ".opc/sessions/sess-abc/flow-state.json"
}
```

---

### opc_flow_reflect

**职责**：持久化反思日志，按 step_id 分流到会话级或管线级存储；按 reflection-server V1-V5 validator + meta-validator 结果判定是否跳出。

**输入**：`{step_id, round, revised_result, evidence_diff, validator_result, objections_kept_by_meta, notes, pipeline_id?, sub_pipeline_id?, phase?}`

- `evidence_diff: {added: [...], modified: [...], removed: [...]}` — 相对上一轮 evidence_artifact 的差量
- `validator_result: {V1, V2, V3, V4, V5}` — 各项 `"ok"|"fail"|"warn"`
- `objections_kept_by_meta: number` — meta-validator 处理后保留的严重 objection 数量

> evidence schema、validator 规则、primary/secondary 方法选择见 [05-opc-reflection-server/02-server-design/00_overview.md §二/§三](../../05-opc-reflection-server/02-server-design/00_overview.md#二evidence-schema) + [01-method-theory/00_overview.md §五](../../05-opc-reflection-server/01-method-theory/00_overview.md#五step--方法-选择决策表primary--secondary)。

**行为**：

```
按 step_id 分流持久化:
  ├── step_id = "task_analysis"  → 写入 flow-state.json.reflection_log[]
  │     · round 字段忽略入参，按 reflection_log.length 推导（幂等：重复提交同 round 覆盖最后一条）
  │     · 不需要 pipeline_id / sub_pipeline_id / phase
  └── step_id = "node_selection" → 必须带 pipeline_id + sub_pipeline_id + phase
        · 写入 state.json.phases[].reflection_log[]
        · 同时在 flow-state.json 留指针 { pipeline_id, sub, phase, log_entry_id }
  ↓
判定（V1-V5 validator + meta-validator 结果驱动）:
  ├── validator_result 全部 ok + objections_kept_by_meta == 0  → 跳出反思，按上层 step 继续
  ├── budget-guard 触发（round 达上限 或 token 超限）          → 强制确认（返回 ask_user）+ 附 reasoning_trace
  └── 继续反思 → 返回下一轮反思指令
        · primary 方法用尽 → 切换 secondary 方法（按 step 决策表）
        · secondary 仍未通过 → 下一轮继续 primary 直至 budget 耗尽
```

**反思日志位置分流原因**：
- 任务分析反思是会话级一次性事件，存 flow-state.json
- 节点选择反思可发生在多个 phase，存 state.json 才能随 phase_reset 回退

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

- [02_flow-tools-entry-lifecycle.md](02_flow-tools-entry-lifecycle.md) — 入口/启动/终结/恢复
- [04_flow-tools-revise-restart.md](04_flow-tools-revise-restart.md) — 修订/重启 + 前置校验
- [06_task-analysis.md](06_task-analysis.md) — task_analysis_complete 的方法论
- [07_task-decomposition.md](07_task-decomposition.md) — decomposition_complete 的方法论
- [08_brief-generation.md](08_brief-generation.md) — brief_complete 的方法论
