# 流程工具 · 步骤路由

> 本文档是 [意图分析总览](00_overview.md) 的子文档。其他子文档：
> [Hook 与混合架构](01_hook-architecture.md) · [流程工具 · 入口与生命周期](02_flow-tools-entry-lifecycle.md) · [流程工具 · 修订与重启](04_flow-tools-revise-restart.md) · [意图识别](05_intent-recognition.md) · [任务分析](06_task-analysis.md) · [任务拆分](07_task-decomposition.md) · [工作单生成](08_brief-generation.md) · [管线创建与阶段执行](09_pipeline-creation.md) · [flow-state schema](10_flow-state-schema.md) · [完整流程示例](11_complete-example.md)

---

## 步骤路由类工具

本篇覆盖 **6 个步骤推进类工具**——它们按 `confidence` / `intent` / `complexity` 把流程从一个步骤路由到下一个。完整工具速览见 [入口与生命周期篇 §流程工具总览](02_flow-tools-entry-lifecycle.md#流程工具总览)。

| 工具 | 一句话职责 |
|------|----------|
| [`opc_intent_complete`](#opc_intent_complete) | 按 intent 路由：task → 分析；question/chat → 流程内部自动 complete |
| [`opc_task_analysis_complete`](#opc_task_analysis_complete) | 按 confidence + complexity + modify_unit_count 三路分流 |
| [`opc_decomposition_complete`](#opc_decomposition_complete) | 按 decomposition_confidence 路由：高 → 简报；低 → 反思 |
| [`opc_brief_complete`](#opc_brief_complete) | 从 accumulated 推导 args，返回 next: opc_pipeline_create |
| [`opc_flow_reflect`](#opc_flow_reflect) | 持久化反思日志（按 step_id 分流到会话级或管线级） |
| [`opc_quick_dispatch`](#opc_quick_dispatch) | low 复杂度快速通道：返回 agent_hint + knowledge_context，流程自动 complete |

---

### opc_intent_complete

**职责**：按 intent + confidence 路由到下一步；question/chat 时内部自动标记流程终结。

**输入**：`{intent, confidence, reasoning}`

**路由表**：

| 入参 intent | confidence | 返回的 next | 流程终结 |
|------------|-----------|------------|---------|
| `task` | ≥ 0.5 | `{tool: "opc_task_analysis_complete"}` + prerequisites:[opc_knowledge_list] | 否 |
| `task` | < 0.5 | `{action: "ask_user"}` + step_instruction: "向用户确认意图" | 否 |
| `project_question` | ≥ 0.5 | `{action: "respond_with_knowledge"}` + prerequisites:[opc_knowledge_search] | **是**（内部自动标记 flow-state.status=completed） |
| `general_question` / `chat` | 任意 | `{done: true, action: "respond_normally"}` | **是**（同上） |

---

### opc_task_analysis_complete

**职责**：按 confidence + complexity + modify_unit_count 三路分流到反思 / 拆分 / 简报 / 快速通道。

**输入**：`{analysis_result, analysis_confidence, confidence_detail}`，其中 `analysis_result.knowledge_plan: [{path, operation: "create"|"update"|"read"}]`。

**路由逻辑**：

```
输入: analysis_result + analysis_confidence + confidence_detail
  ↓
计算 modify_unit_count = count(distinct unit) where:
    unit = knowledge_plan[i].path.split("/")[0]
    knowledge_plan[i].operation ∈ ["create", "update"]
  (按 unit 去重，多个 subsection 在同一 unit 只算 1)
  ↓
分支 1: 置信度判定
  ├── ≥ 0.8 → 跳过反思 → 进入分支 2
  ├── 0.5-0.8 → 返回 opc_flow_reflect 指令（最多 2 轮）
  └── < 0.5 → 返回 opc_flow_reflect 指令（最多 3 轮）

分支 2: 复杂度/拆分判定（仅高置信度或反思后到达）
  ├── complexity = low → 返回 opc_quick_dispatch 指令（处理后流程自动 complete）
  ├── modify_unit_count ≥ 2 → 返回 task_decomposition 指令
  └── modify_unit_count ≤ 1 → 返回 brief_generation 指令
```

---

### opc_decomposition_complete

**职责**：按 decomposition_confidence 路由：高置信度 → 简报；低 → 反思。

**输入**：`{sub_pipelines, execution_order, decomposition_confidence, confidence_detail}`

**路由表**：

| decomposition_confidence | 返回的 next | step_instruction |
|------|--------|--------|
| ≥ 0.8 | brief_generation | "拆分结果已自动确认，开始生成 brief" |
| 0.5-0.8 | brief_generation | "拆分结果置信度中等，展示方案后开始生成 brief" |
| < 0.5 | ask_user 或 reflect | "拆分置信度低，请用户确认或进入反思" |

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

**职责**：持久化反思日志，按 step_id 分流到会话级或管线级存储。

**输入**：`{step_id, round, revised_result, new_confidence, notes, pipeline_id?, sub_pipeline_id?, phase?}`

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
判定:
  ├── new_confidence ≥ 阈值（task 用 0.8；node 用 phase.min_confidence_for_auto）→ 跳出反思
  ├── round 达上限 → 强制确认（返回 ask_user）
  └── 继续反思 → 返回下一轮反思指令（按视角切换）
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
